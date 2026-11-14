package com.worldwar.genshtab;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hosts the game (an HTML5 canvas application bundled in assets/app) in a full-screen WebView
 * and gives it file storage for saved games.
 */
public class MainActivity extends Activity {
    private WebView web;
    private int insetTop, insetBottom, insetLeft, insetRight;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(27, 37, 48));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pushInsets();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("WorldWar", m.message() + " @" + m.lineNumber());
                return true;
            }
        });
        web.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                readInsets(insets);
                pushInsets();
                return insets;
            }
        });
        setContentView(web);
        hideSystemBars();
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/app/index.html");
    }

    /** Safe areas (display cutout plus whatever system bars stay visible) in CSS pixels. */
    private void readInsets(WindowInsets insets) {
        float d = getResources().getDisplayMetrics().density;
        int t = 0, b = 0, l = 0, r = 0;
        if (Build.VERSION.SDK_INT >= 30) {
            Insets i = insets.getInsets(WindowInsets.Type.displayCutout() | WindowInsets.Type.systemBars());
            t = i.top; b = i.bottom; l = i.left; r = i.right;
        } else if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
            t = insets.getDisplayCutout().getSafeInsetTop();
            b = insets.getDisplayCutout().getSafeInsetBottom();
            l = insets.getDisplayCutout().getSafeInsetLeft();
            r = insets.getDisplayCutout().getSafeInsetRight();
        }
        insetTop = Math.round(t / d);
        insetBottom = Math.round(b / d);
        insetLeft = Math.round(l / d);
        insetRight = Math.round(r / d);
    }

    private void pushInsets() {
        if (web == null) return;
        String js = "(function(){var s=document.documentElement.style;"
                + "s.setProperty('--sat','" + insetTop + "px');s.setProperty('--sab','" + insetBottom + "px');"
                + "s.setProperty('--sal','" + insetLeft + "px');s.setProperty('--sar','" + insetRight + "px');"
                + "window.dispatchEvent(new Event('resize'));})()";
        web.evaluateJavascript(js, null);
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Let the game close its menus first; leave the app only when it has nothing to close.
        web.evaluateJavascript("(window.onAndroidBack && window.onAndroidBack()) ? 'y' : 'n'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("y")) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        // The page pauses the game and writes an autosave when it becomes hidden.
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ---- storage bridge -----------------------------------------------------------------------------
    private File savesDir() {
        File d = new File(getFilesDir(), "saves");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String clean(String name) {
        if (name == null) return "_";
        String n = name.replaceAll("[^A-Za-z0-9_.-]", "_");
        if (n.isEmpty() || n.startsWith(".")) n = "_" + n;
        return n.length() > 64 ? n.substring(0, 64) : n;
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** Methods exposed to the page as window.AndroidBridge */
    public class Bridge {
        @JavascriptInterface
        public boolean saveFile(String name, String data) {
            File dir = savesDir();
            File tmp = new File(dir, clean(name) + ".tmp");
            File dst = new File(dir, clean(name));
            OutputStream o = null;
            try {
                o = new FileOutputStream(tmp);
                o.write(data.getBytes(StandardCharsets.UTF_8));
                o.close();
            } catch (Exception e) {
                try { if (o != null) o.close(); } catch (Exception ignored) { }
                tmp.delete();
                return false;
            }
            if (dst.exists() && !dst.delete()) return false;
            return tmp.renameTo(dst);
        }

        @JavascriptInterface
        public String loadFile(String name) {
            File f = new File(savesDir(), clean(name));
            if (!f.exists()) return null;
            InputStream in = null;
            try {
                in = new FileInputStream(f);
                return readAll(in);
            } catch (Exception e) {
                return null;
            } finally {
                try { if (in != null) in.close(); } catch (Exception ignored) { }
            }
        }

        @JavascriptInterface
        public boolean deleteFile(String name) {
            return new File(savesDir(), clean(name)).delete();
        }

        @JavascriptInterface
        public String listFiles() {
            JSONArray a = new JSONArray();
            File[] files = savesDir().listFiles();
            if (files != null) for (File f : files) {
                String n = f.getName();
                if (!n.endsWith(".tmp")) a.put(n);
            }
            return a.toString();
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
