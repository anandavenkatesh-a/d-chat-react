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
 *   "TorWS_error"   -> { message: string }  (now includes exception class
 *                        name for diagnosis, e.g. distinguishing a genuine
 *                        SocketTimeoutException from other failure types
 *                        that OkHttp/Tor might otherwise bucket together)
 *
 * Only ONE connection is supported at a time, matching the app's existing
 * singleton socket.js design (one persistent connection to the relay).
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

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

public class TorWebSocketModule extends ReactContextBaseJavaModule {

    private static final String TAG = "TorWebSocketModule";

    private final ReactApplicationContext reactContext;
    private OkHttpClient client;
    private WebSocket webSocket;

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

    /**
     * Opens a WebSocket connection to `url`, routed through the local
     * SOCKS5 proxy at 127.0.0.1:socksPort (i.e. Tor).
     *
     * Resolves the promise once the underlying HTTP client + request are
     * built and the connection attempt has started — NOT once the socket
     * is actually open. Listen for the "TorWS_open" event for that.
     */
    @ReactMethod
    public void connect(String url, int socksPort, Promise promise) {
        try {
            closeInternal(1000, "Reconnecting");

            Proxy socksProxy = new Proxy(
                Proxy.Type.SOCKS,
                new InetSocketAddress("127.0.0.1", socksPort)
            );

            client = new OkHttpClient.Builder()
                .proxy(socksProxy)
                // Generous timeouts — a fresh Tor circuit adds real extra
                // latency vs a direct connection. First-use-after-bootstrap
                // in particular can occasionally need longer than a typical
                // direct-connection timeout while Tor finishes selecting
                // and testing a circuit for the first real request.
                .connectTimeout(60, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)   // WebSocket: no read timeout
                // Shortened from 30s to 8s. A dead connection (e.g. the
                // phone was offline/backgrounded and the OS silently
                // dropped the socket without a clean close) is only
                // detected when a ping fails — with the old 30s interval,
                // messages could appear to silently "not arrive" for up
                // to that same ~30s window after connectivity actually
                // returned, before the app even realized it needed to
                // reconnect. 8s keeps detection fast without pinging
                // aggressively enough to waste meaningful battery.
                .pingInterval(8, TimeUnit.SECONDS)
                .build();

            Request request = new Request.Builder()
                .url(url)
                // Deliberately generic User-Agent — never reveal RN/OkHttp/
                // device details to the relay, consistent with the app's
                // fingerprint-stripping goals.
                .header("User-Agent", "D-Chat/1.0")
                .build();

            webSocket = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(@NonNull WebSocket ws, @NonNull Response response) {
                    emit("TorWS_open", new WritableNativeMap());
                }

                @Override
                public void onMessage(@NonNull WebSocket ws, @NonNull String text) {
                    WritableMap params = new WritableNativeMap();
                    params.putString("data", text);
                    emit("TorWS_message", params);
                }

                @Override
                public void onMessage(@NonNull WebSocket ws, @NonNull ByteString bytes) {
                    // The relay protocol is JSON text only — binary frames
                    // are unexpected. Ignored deliberately rather than
                    // guessing at an encoding.
                }

                @Override
                public void onClosing(@NonNull WebSocket ws, int code, @NonNull String reason) {
                    ws.close(code, reason);
                }

                @Override
                public void onClosed(@NonNull WebSocket ws, int code, @NonNull String reason) {
                    WritableMap params = new WritableNativeMap();
                    params.putInt("code", code);
                    params.putString("reason", reason);
                    emit("TorWS_close", params);
                }

                @Override
                public void onFailure(@NonNull WebSocket ws, @NonNull Throwable t, Response response) {
                    // Include the exception's actual class name so failures
                    // that OkHttp otherwise reports with the same generic
                    // message (e.g. "Connect timed out") can be told apart —
                    // a java.net.SocketTimeoutException (genuine timeout)
                    // looks very different in cause from, say, a connection
                    // actively refused or reset by the remote/proxy side.
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
        closeInternal(1000, "Client closed");
        promise.resolve(null);
    }

    private void closeInternal(int code, String reason) {
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