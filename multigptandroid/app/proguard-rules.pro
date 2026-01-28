# Keep existing project rules
-include proguard-project.txt

# WeChat OpenSDK
-dontwarn com.tencent.mm.opensdk.**
-keep class com.tencent.mm.opensdk.** { *; }
