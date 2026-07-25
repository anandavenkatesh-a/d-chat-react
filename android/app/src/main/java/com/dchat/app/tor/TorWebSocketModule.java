package com.dchat.app.tor;

/**
 * TorWebSocketModule.java
 *
 * React Native's built-in global `WebSocket` has no way to route through a
 * local SOCKS5 proxy, which is what Tor exposes (via TorService.getSocksPort()).
 * This module provides a minimal native WebSocket client built on OkHttp
 * (which DOES support SOCKS proxies via java.net.Proxy), and bridges its
 * events back to JS.
 *
 * JS-facing API (see src/services/socket.js):
 *   TorWebSocketModule.connect(url, socksPort)  -> Promise<void>
 *   TorWebSocketModule.send(text)               -> Promise<boolean>
 *   TorWebSocketModule.close()                  -> Promise<void>
 *
 * Events emitted:
 *   "TorWS_open"    -> {}
 *   "TorWS_message" -> { data: string }
 *   "TorWS_close"   -> { code: number, reason: string }
 *   "TorWS_error"   -> { message: string }
 *
 * Only ONE connection is supported at a time, matching the app's existing
 * singleton socket.js design (one persistent connection to the relay).
 *
 * ⚠️ GENERATION TRACKING — why this exists:
 * socket.js sometimes needs to abandon an in-flight connection attempt
 * and immediately start a new one (e.g. the app returning to the
 * foreground forces disconnect() + connect() back to back). connect()
 * always tears down any existing WebSocket first — but OkHttp's
 * callbacks for that OLD, abandoned WebSocket (onClosing/onClosed/
 * onFailure) run asynchronously on OkHttp's own thread, and can fire
 * AFTER the new connection has already started. Since socket.js's JS
 * side has exactly one long-lived event listener for the module's
 * entire lifetime (not one per connection attempt), it had no way to
 * tell "this close event is about the OLD, already-abandoned attempt"
 * apart from "this close event is about my BRAND NEW attempt" — a
 * stale event could prematurely kill a fresh, otherwise-healthy
 * connection. Every callback below now checks it's still describing
 * the CURRENT connection generation before emitting anything to JS;
 * stale events from a superseded attempt are silently dropped here,
 * at the source, rather than confusing the JS layer.
 */

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

public class TorWebSocketModule extends ReactContextBaseJavaModule {

    private static final String TAG = "TorWebSocketModule";
    private static final int NORMAL_CLOSURE = 1000;

    private static boolean isReservedCloseCode(int code) {
        return code == 1005 || code == 1006 || code < 1000 || (code >= 1004 && code <= 1006);
    }

    private final ReactApplicationContext reactContext;
    private OkHttpClient client;
    private WebSocket webSocket;

    // Incremented every time connect() starts a genuinely new attempt.
    // Each WebSocketListener instance captures the generation value
    // that was current AT THE MOMENT IT WAS CREATED, and compares
    // against this field on every callback — if they no longer match,
    // a newer connect() has since superseded this one, and the event
    // is stale and gets dropped.
    private final AtomicInteger currentGeneration = new AtomicInteger(0);

    public TorWebSocketModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "TorWebSocketModule";
    }

    private void emit(String eventName, WritableMap params) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }

    @ReactMethod
    public void connect(String url, int socksPort, Promise promise) {
        try {
            closeInternal(NORMAL_CLOSURE, "Reconnecting");

            // This attempt's own generation number, fixed at creation
            // time — every callback below closes over this exact value.
            final int myGeneration = currentGeneration.incrementAndGet();

            Proxy socksProxy = new Proxy(
                Proxy.Type.SOCKS,
                new InetSocketAddress("127.0.0.1", socksPort)
            );

            client = new OkHttpClient.Builder()
                .proxy(socksProxy)
                .connectTimeout(60, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(8, TimeUnit.SECONDS)
                .build();

            Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "D-Chat/1.0")
                .build();

            webSocket = client.newWebSocket(request, new WebSocketListener() {

                /** True if a NEWER connect() has since superseded this attempt. */
                private boolean isStale() {
                    return currentGeneration.get() != myGeneration;
                }

                @Override
                public void onOpen(@NonNull WebSocket ws, @NonNull Response response) {
                    if (isStale()) return;
                    emit("TorWS_open", new WritableNativeMap());
                }

                @Override
                public void onMessage(@NonNull WebSocket ws, @NonNull String text) {
                    if (isStale()) return;
                    WritableMap params = new WritableNativeMap();
                    params.putString("data", text);
                    emit("TorWS_message", params);
                }

                @Override
                public void onMessage(@NonNull WebSocket ws, @NonNull ByteString bytes) {
                    // JSON text only — binary frames unexpected, ignored.
                }

                @Override
                public void onClosing(@NonNull WebSocket ws, int code, @NonNull String reason) {
                    int safeCode = isReservedCloseCode(code) ? NORMAL_CLOSURE : code;
                    try {
                        ws.close(safeCode, reason);
                    } catch (IllegalArgumentException e) {
                        try {
                            ws.close(NORMAL_CLOSURE, "Closing");
                        } catch (Exception ignored) {
                            // socket already in a terminal state either way
                        }
                    }
                }

                @Override
                public void onClosed(@NonNull WebSocket ws, int code, @NonNull String reason) {
                    if (isStale()) return; // this is the critical check — see file header
                    WritableMap params = new WritableNativeMap();
                    params.putInt("code", code);
                    params.putString("reason", reason);
                    emit("TorWS_close", params);
                }

                @Override
                public void onFailure(@NonNull WebSocket ws, @NonNull Throwable t, Response response) {
                    if (isStale()) return; // same — a failure on an abandoned attempt isn't news
                    String exceptionClass = t.getClass().getName();
                    String rawMessage = t.getMessage() != null ? t.getMessage() : "(no message)";
                    String httpStatus = response != null ? (" | HTTP status: " + response.code()) : "";

                    WritableMap params = new WritableNativeMap();
                    params.putString("message", exceptionClass + ": " + rawMessage + httpStatus);
                    emit("TorWS_error", params);
                }
            });

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("TOR_WS_CONNECT_FAILED", e.getClass().getName() + ": " + e.getMessage());
        }
    }

    @ReactMethod
    public void send(String text, Promise promise) {
        if (webSocket == null) {
            promise.resolve(false);
            return;
        }
        boolean queued = webSocket.send(text);
        promise.resolve(queued);
    }

    @ReactMethod
    public void close(Promise promise) {
        closeInternal(NORMAL_CLOSURE, "Client closed");
        promise.resolve(null);
    }

    private void closeInternal(int code, String reason) {
        // Bump the generation here too — an explicit close() should
        // also invalidate any in-flight listener callbacks for the
        // connection being closed, not just a fresh connect() call.
        currentGeneration.incrementAndGet();

        if (webSocket != null) {
            try {
                webSocket.close(code, reason);
            } catch (Exception ignored) {
                // Already closed / never opened — fine.
            }
            webSocket = null;
        }
        if (client != null) {
            client.dispatcher().executorService().shutdown();
            client = null;
        }
    }

    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}