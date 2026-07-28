# ProGuard rules for Remote Control Agent

# Keep Gson serialization
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class com.remotecontrol.agent.** { *; }

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
