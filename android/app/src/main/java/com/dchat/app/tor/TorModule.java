package com.dchat.app.tor;

/**
 * TorModule.java
 *
 * Native bridge exposing Guardian Project's tor-android TorService to JS.
 * Based on the verified public API of org.torproject.jni.TorService
 * (info.guardianproject:tor-android), specifically the usage pattern shown
 * in that library's own sample app (MainActivity.kt):
 *
 *   bindService(Intent(this, TorService::class.java), connection, BIND_AUTO_CREATE)
 *   -> ServiceConnection.onServiceConnected gives a TorService.LocalBinder
 *   -> binder.getService() gives the running TorService
 *   -> service.getTorControlConnection() is null until Tor has bootstrapped
 *   -> service.getSocksPort() / getHttpTunnelPort() once bootstrapped
 *
 * JS-facing API (see src/services/tor.js):
 *   TorModule.start()      -> Promise<{ socksPort, httpTunnelPort }>
 *   TorModule.stop()       -> Promise<void>
 *   TorModule.getStatus()  -> Promise<string>  ("OFF"|"STARTING"|"ON"|"STOPPING")
 *   Event "TorStatusChanged" -> { status: string }
 */

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.torproject.jni.TorService;

public class TorModule extends ReactContextBaseJavaModule {

    private static final String TAG = "TorModule";
    private static final String EVENT_STATUS_CHANGED = "TorStatusChanged";

    private final ReactApplicationContext reactContext;

    private TorService torService;      // set once bound
    private boolean isBound = false;
    private volatile String lastStatus = TorService.STATUS_OFF;

    // Resolved once Tor reports STATUS_ON AND the bound service is available.
    private Promise pendingStartPromise;

    public TorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "TorModule";
    }

    // ── Broadcast receiver for TorService.ACTION_STATUS ─────────────────────────

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String status = intent.getStringExtra(TorService.EXTRA_STATUS);
            if (status == null) return;

            lastStatus = status;
            Log.i(TAG, "Tor status: " + status);
            emitStatus(status);

            if (TorService.STATUS_ON.equals(status)) {
                resolvePendingStartIfReady();
            }
        }
    };

    private void emitStatus(String status) {
        if (reactContext.hasActiveReactInstance()) {
            com.facebook.react.bridge.WritableMap params =
                new com.facebook.react.bridge.WritableNativeMap();
            params.putString("status", status);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_STATUS_CHANGED, params);
        }
    }

    // ── Service connection ───────────────────────────────────────────────────────

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            torService = ((TorService.LocalBinder) service).getService();
            isBound = true;
            Log.i(TAG, "Bound to TorService");
            // If Tor already reported ON before we finished binding, resolve now.
            resolvePendingStartIfReady();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.i(TAG, "TorService disconnected");
            torService = null;
            isBound = false;
        }
    };

    private void resolvePendingStartIfReady() {
        if (pendingStartPromise == null) return;
        if (torService == null) return;
        if (!TorService.STATUS_ON.equals(lastStatus)) return;

        int socksPort = torService.getSocksPort();
        int httpTunnelPort = torService.getHttpTunnelPort();

        if (socksPort <= 0) {
            // Tor reported ON but hasn't finished assigning ports yet — the
            // caller's own retry/backoff in tor.js handles this edge case if
            // it ever occurs; log it clearly rather than resolving with 0.
            Log.w(TAG, "Tor is ON but socksPort not yet available");
            return;
        }

        com.facebook.react.bridge.WritableMap result =
            new com.facebook.react.bridge.WritableNativeMap();
        result.putInt("socksPort", socksPort);
        result.putInt("httpTunnelPort", httpTunnelPort);

        pendingStartPromise.resolve(result);
        pendingStartPromise = null;
    }

    // ── JS-facing methods ────────────────────────────────────────────────────────

    @ReactMethod
    public void start(Promise promise) {
        if (isBound && torService != null && TorService.STATUS_ON.equals(lastStatus)) {
            // Already running — resolve immediately with current ports.
            com.facebook.react.bridge.WritableMap result =
                new com.facebook.react.bridge.WritableNativeMap();
            result.putInt("socksPort", torService.getSocksPort());
            result.putInt("httpTunnelPort", torService.getHttpTunnelPort());
            promise.resolve(result);
            return;
        }

        pendingStartPromise = promise;

        try {
            ContextCompat.registerReceiver(
                reactContext,
                statusReceiver,
                new IntentFilter(TorService.ACTION_STATUS),
                ContextCompat.RECEIVER_NOT_EXPORTED
            );
        } catch (IllegalArgumentException alreadyRegistered) {
            // Receiver already registered from a previous start() call — fine.
        }

        Intent bindIntent = new Intent(reactContext, TorService.class);
        boolean bound = reactContext.bindService(bindIntent, serviceConnection, Context.BIND_AUTO_CREATE);

        if (!bound) {
            pendingStartPromise = null;
            promise.reject("TOR_BIND_FAILED", "Could not bind to TorService");
        }
        // Otherwise: promise resolves later, from resolvePendingStartIfReady()
        // once both the service is bound AND status reaches ON.
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            if (isBound) {
                reactContext.unbindService(serviceConnection);
                isBound = false;
            }
            try {
                reactContext.unregisterReceiver(statusReceiver);
            } catch (IllegalArgumentException notRegistered) {
                // no-op — receiver wasn't registered
            }

            Intent stopIntent = new Intent(reactContext, TorService.class);
            // Using the literal action string rather than TorService.ACTION_STOP —
            // that constant's visibility has varied between tor-android source
            // versions and published Maven artifacts (it compiled as private in
            // the resolved 0.4.8.17.2 build). The string value itself is stable
            // and documented, so this is not a functional workaround, just an
            // access-modifier one.
            stopIntent.setAction("org.torproject.android.intent.action.STOP");
            reactContext.startService(stopIntent);

            torService = null;
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("TOR_STOP_FAILED", e.getMessage());
        }
    }

    @ReactMethod
    public void getStatus(Promise promise) {
        promise.resolve(lastStatus);
    }

    /**
     * Returns the current SOCKS5 port, or -1 if Tor isn't running yet.
     * Used by TorWebSocketModule to know where to route WebSocket traffic.
     */
    @ReactMethod
    public void getSocksPort(Promise promise) {
        if (torService != null && TorService.STATUS_ON.equals(lastStatus)) {
            promise.resolve(torService.getSocksPort());
        } else {
            promise.resolve(-1);
        }
    }

    // Required for NativeEventEmitter on the JS side — no-op here since we
    // don't need to start/stop native listeners based on JS subscriber count.
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}
