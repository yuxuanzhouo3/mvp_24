# Keep existing project rules
-include proguard-project.txt

# WeChat OpenSDK
-dontwarn com.tencent.mm.opensdk.**
-keep class com.tencent.mm.opensdk.** { *; }

# Ignore missing Median Widget resources (removed to disable ads)
-dontwarn co.median.median_core.MedianWidgetHelper
-dontwarn co.median.median_core.R$layout
-keep class co.median.median_core.MedianWidgetHelper {
    public static void showOnLaunchIfNeeded(...);
    public static void showOnJSBridgeCallIfNeeded(...);
}
# Make the methods return immediately without doing anything
-assumenosideeffects class co.median.median_core.MedianWidgetHelper {
    public static void showOnLaunchIfNeeded(...);
    public static void showOnJSBridgeCallIfNeeded(...);
}
