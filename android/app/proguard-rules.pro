# Methods called from JavaScript must keep their names.
-keepclassmembers class com.worldwar.genshtab.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
