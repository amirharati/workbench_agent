August 8, 202210 min read

[![Share to twitter](https://www.100ms.live/_next/image?url=%2Fassets%2Ffooter%2Ftwitter_white.svg&w=48&q=75)](https://twitter.com/intent/tweet?text=WebRTC%20in%20WebView%20-%20Build%20Live%20Mobile%20Apps%20with%20JavaScript%20https://www.100ms.live/blog/webrtc-webview)[![Share to facebook](https://www.100ms.live/_next/image?url=%2Fassets%2Ffooter%2Ffacebook_white.svg&w=48&q=75)](https://www.facebook.com/sharer/sharer.php?u=https://www.100ms.live/blog/webrtc-webview)[![](https://www.100ms.live/_next/image?url=%2Fassets%2Ffooter%2Flinkedin_white.svg&w=48&q=75)](https://www.linkedin.com/shareArticle?mini=true&url=https://www.100ms.live/blog/webrtc-webview)

Link copied

By now, developers are well aware that WebRTC is one of the most optimal protocols to capture and stream audio and video over the internet. It is also used for exchanging arbitrary data between browsers without an intermediary. Essentially, WebRTC enables browsers and apps to share data and perform teleconferencing peer-to-peer, without requiring the user to install plug-ins or any third-party software.

If you’re developing an app that includes audio-video communication, then this piece will discuss a quick, useful hack to help with the process. Using WebRTC as a WebView in your app.

WebView lets you get a browser-like interface right within your mobile application. The WebView allows users to display web content directly within an application. This is especially useful when developers need advanced configuration options and more control over the UI in order to embed web pages in a specially-designed app environment. It also saves time when shipping an app already made for the web to a mobile device.

This article will discuss how to enable WebRTC as a WebView on Android, iOS & Flutter.

## [Enabling WebView WebRTC](#enabling-webview-webrtc)

By the end of the tutorial, you’ll know how to add WebRTC apps to different platforms. However, to test out WebRTC, we’ll first have to create relevant deployments so that we can obtain the necessary URLs.

> Originally we would have used [https://test.webrtc.org](https://test.webrtc.org/) or [https://apprtc-m.appspot.com](https://apprtc-m.appspot.com/) to test our integration. However, these publicly available services have been turned down as of 2021-12-1. More information is available [here](https://groups.google.com/g/discuss-webrtc/c/H7XuZfgkGH0/m/Q0BKTWZICgAJ?utm_medium=email&utm_source=footer&pli=1).

In place of the above links, we will use **100ms** to create the necessary apps in a few easy steps.

Let’s start by setting up a 100ms project.

*   Go to [https://dashboard.100ms.live/](https://dashboard.100ms.live/dashboard) and create an account.
    
    ![Setting up the project](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_11_43_58_PM_f5095035c9/Screenshot_2022_06_28_at_11_43_58_PM_f5095035c9.png)
    
*   Create a new app by selecting the **Video Conferencing** template.
    
    ![Selecting the template](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_11_44_17_PM_9bace7f81c/Screenshot_2022_06_28_at_11_44_17_PM_9bace7f81c.png)
    
*   Click on **Deploy Now** and configure deployment. Give your app a subdomain and click on **Continue**.
    
    ![Deploying the app](https://storage.googleapis.com/100ms-cms-prod/cms/Screenshot_2022_06_28_at_11_44_39_PM_65fbf124ea/Screenshot_2022_06_28_at_11_44_39_PM_65fbf124ea.png)
    
*   Finish creating the app and click on the **Invite** button.
    
    ![Finish setting up the app](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_11_44_47_PM_94f74b306b/Screenshot_2022_06_28_at_11_44_47_PM_94f74b306b.png)
    
*   Copy the URL and save it. We’ll need to use it as WebView in our Android, iOS, and Flutter projects.
    
    ![Saving the project](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_11_44_59_PM_0dee0733af/Screenshot_2022_06_28_at_11_44_59_PM_0dee0733af.png)
    

## [Android WebView & WebRTC](#android-webview-%26-webrtc)

We’ll start by creating a new Android project using [Android Studio](https://developer.android.com/studio?gclid=Cj0KCQjwidSWBhDdARIsAIoTVb15LyZh4Pc89pQ8F9MoN8TJoHVjGh9xR1S42OvEUdPKpnRT67RrXmYaAtZ2EALw_wcB&gclsrc=aw.ds).

*   Open Android Studio and click on New Project. Select Empty Activity and give the project a name.

![Setting up the project in android studio](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_10_32_57_AM_bc76732fdd/Screenshot_2022_06_28_at_10_32_57_AM_bc76732fdd.png)

*   We’ll call it **WebviewWebRTC**. Click on Finish to create the project.

![Fnishing up the project in android studio](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_10_33_19_AM_6c9e55ad5c/Screenshot_2022_06_28_at_10_33_19_AM_6c9e55ad5c.png)

*   Inside the `MainActivity.kt` of the project, add `import android.webkit.WebView` to the imports. Next, modify the `AppCompatActivity` as follows:

```
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val WebView: WebView = findViewById(R.id.webview)
        WebView.settings.javaScriptEnabled = true
        WebView.settings.domStorageEnabled = true
        WebView.setWebChromeClient(object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        })
        WebView.loadUrl("https://<your-template-subdomain>.app.100ms.live/preview/<room-code>")
    }
}
```

*   Here, use the URL created earlier inside `loadUrl` to launch it.
*   Next, add the following permissions to the `AndroidManifest.xml`:

```
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

*   Add the WebView tag in `activity_main.xml` as shown below:

```
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        />

</androidx.constraintlayout.widget.ConstraintLayout>
```

The application is now ready for launch.

Click on **Run app**. Wait for the application to build and launch on the emulator or mobile device you are using.

It should look something as seen below:

![Finished Webrtc Webview Android App](https://storage.googleapis.com/100ms-cms-qa/cms/GIF_7d281ebb1d/GIF_7d281ebb1d.gif)

## [**iOS WebView & WebRTC**](#ios-webview-%26-webrtc)

Now, we try setting up the WebView on iOS to test out WebRTC.

*   Start by creating a new iOS project. Under the **iOS** tab, select **App** and click on **Next**. We’ll name this project **WebviewWebRTC**.

![New iOS Project](https://storage.googleapis.com/100ms-cms-qa/cms/Screenshot_2022_06_28_at_9_18_37_PM_f804da4460/Screenshot_2022_06_28_at_9_18_37_PM_f804da4460.png)

*   Inside the project, modify the `ContentView` file. Start by adding the `import WebKit`
*   Here, add the code as follows:

```
import SwiftUI
import WebKit

struct ContentView: View {
    @State private var showWebView = false
    
    var body: some View{
        WebView(url: URL(string: "https://<your-template-subdomain>.app.100ms.live/preview/<room-code>")!)
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
 
struct WebView: UIViewRepresentable {
    var url: URL
    func makeUIView(context: Context) -> WKWebView {
        return WKWebView()
    }
    func updateUIView(_ webView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        webView.load(request)
    }
}
```

*   To access the Camera and Microphone, modify permissions in `info.plist`
*   Now run the app. Here, we are running the application on an iPhone 12 iOS simulator.
*   It will ask for permission to access the Camera and Microphone. Allow said permissions.

![Allowing Permissions](https://storage.googleapis.com/100ms-cms-qa/cms/Untitled_design_7_19a1ebbca4/Untitled_design_7_19a1ebbca4.png)

The project should now run. It should operate as seen below:

![Finished Webrtc Webview iOS App](https://storage.googleapis.com/100ms-cms-qa/cms/GI_Fio_3b260db81b/GI_Fio_3b260db81b.gif)

## [Flutter WebView & WebRTC](#flutter-webview-%26-webrtc)

Lastly, we create a Flutter Project to set up WebRTC in WebView.

*   Run the `flutter create webview` command to create a new Flutter project. To enable WebView, add the [`Flutter InAppWebView`](https://inappwebview.dev/) package by running the command below:

```
flutter pub add webview_flutter
```

*   To add Camera and Microphone permissions, run the following command:

```
flutter pub add permission_handler
```

*   Modify the `main.dart` code inside the `lib` folder as follows:

```
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';

Future main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Permission.camera.request();
  await Permission.microphone.request();

  runApp(WebviewScreen());
}

class WebviewScreen extends StatefulWidget {
  const WebviewScreen({Key? key}) : super(key: key);

  @override
  State<WebviewScreen> createState() => _WebviewScreenState();
}

class _WebviewScreenState extends State<WebviewScreen> {
  void initState() {
    super.initState();
    if (Platform.isAndroid) WebView.platform = AndroidWebView();
  }

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: WebView(
        javascriptMode: JavascriptMode.unrestricted,
        initialUrl: 'https://<your-template-subdomain>.app.100ms.live/preview/<room-code>',
      ),
    );
  }
}
```

*   Inside `AndroidManifest.xml` add the following permissions within the `<manifest>` tag:

```
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.VIDEO_CAPTURE" />
    <uses-permission android:name="android.permission.AUDIO_CAPTURE" />
```

> Note: To run the application using a Bluetooth device, we might need to set up Bluetooth permissions.

*   Set the `compileSdkVersion` to 30 in the **android/app/build.gradle** file:

```
android {
  compileSdkVersion 30
  ...
}
```

*   Set the `minSdkVersion` to 21:

```
android {
  defaultConfig {
		minSdkVersion 21
		...
	}
  ...
}
```

*   Run the app. It will ask for permission to access the Camera and Microphone. Allow said permissions.

![](https://storage.googleapis.com/100ms-cms-qa/cms/Untitled_design_8_bbf97e9e6b/Untitled_design_8_bbf97e9e6b.png)

The app should now run, as seen below:

![Finished Webrtc Webview Flutter App](https://storage.googleapis.com/100ms-cms-qa/cms/Untitled_design_2f346ae868/Untitled_design_2f346ae868.gif)

That’s it. We have just successfully set up WebView WebRTC in Android, iOS, and Flutter.

## [Conclusion](#conclusion)

WebView in WebRTC is useful when trying to replicate a website experience within a mobile app. It can come in handy when you have your web app ready and want to view content as seen on a mobile browser inside your application. This makes apps quick and easy to ship and makes developers’ lives easier by a long shot.