[![Image 1: Amorn Apichattanakul](https://miro.medium.com/v2/resize:fill:32:32/1*xUHBdMSNjq6ci0K1-sBt2Q.png)](https://medium.com/@benamorn?source=post_page---byline--6997edd28b29---------------------------------------)

8 min read

Dec 15, 2023

Referring to my previous article in which I implemented Face Liveness Detection in Flutter using the Flutter Camera package:

This is essentially a continuation, where I aim to enhance the performance by adopting a more native approach rather than resorting to workarounds in Flutter for the image transfer.

In the previous article, I outlined the flow to identify its shortcomings, as described below:

![Image 2](https://miro.medium.com/v2/resize:fit:571/1*Ro5LGPDzopVCyvyMjJhcwg.jpeg)

As it stands, the primary issue with the first approach is the inefficient utilization of CPU and time. The process involves sending an image to Flutter, only for Flutter to subsequently send it back. I’m required to convert the Flutter image format back to the standard JPG/PNG format before feeding into the machine learning (ML) model. Once I obtain the ML results, I need to transmit these results back to Flutter to show the UI in the next steps

In this version, I plan to eliminate the back-and-forth image transfer process by directly feeding the image from the native camera into the SDK. I will send only the results and texture back to Flutter. While this approach theoretically promises significant improvements in terms of speed, I cannot confirm its performance until I implement it.

This led me to explore the inner workings of Flutter camera packages to understand how they transmit information to Flutter. After conducting research, I identified a suitable package that aligns with my requirements in the name of ‘**mobile_scanner**’.

During my research, I noticed they use the native camera to directly feed video output into ML for barcode and QR code detection. This approach aligns well with my objectives, with the only difference being the use of our own ML SDK. Based on this example, I’m confident that my method will work effectively, offering improved performance.

## Let’s dive in!

My colleague and I made the decision to develop our own libraries by creating a Flutter plugin. This plugin will be available for anyone interested in integrating Face Liveness Detection into their Flutter projects, making it as simple as adding it to their `pubspec.yaml` file. How to create it? Here’s the instruction from the Flutter documentation:

After spending some time making it work on the iOS side, I conducted an in-depth investigation on the performance of the new version and compared it to the old one to determine if it indeed performs better.

Here’s the result from FaceLiveness V2:

I have no idea why Flutter V2 consumes less CPU compared to Native. I’ve experimented multiple times and the results were always the same. Nevertheless, the Native approach uses less RAM.

Press enter or click to view image in full size

![Image 3](https://miro.medium.com/v2/resize:fit:700/1*yfTlWe4xvRgCbhm0DLqQpg.png)

FaceLiveness with Native Camera, iPhone 14 Pro Max

Press enter or click to view image in full size

![Image 4](https://miro.medium.com/v2/resize:fit:700/1*I1r_1FLy1vjuUk9gQl55IA.png)

FaceLiveness with Native Camera, iPhone 6s Plus

The results indicate a significant improvement in CPU usage and frame rate, particularly on low-end devices like the iPhone 6s Plus. The performance has transitioned from being unusable to finally usable!!

## Get Amorn Apichattanakul’s stories in your inbox

Join Medium for free to get updates from this writer.

Remember me for faster sign in

To embed the library into iOS and Android using XCFramework and AAR, additional tasks are necessary. Let me explain.

## iOS

Add this snippet of code in **xxx.podspec**. Replace xxx with your framework name and put it along with your podspec.

s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }

s.swift_version = '5.0'

s.preserve_paths = 'xxx.xcframework/**/*'

s.xcconfig = { 'OTHER_LDFLAGS' => '-framework xxx' }

s.vendored_frameworks = 'xxx.xcframework'
This will embed your xcFramework into the main lib when you pull it into pubspec.yml

## Android

For AAR, it is a lot more complicated. Copy this code into build.gradle. It will find AAR in the project and convert into internal lib.

String localMavenPath = project.mkdir("build").absolutePath

String aarPath = localMavenPath

task useAar {

 File file = project.file("libs")

 if (file.exists() && file.isDirectory()) {

 file.listFiles(new FileFilter() {

 @Override

 boolean accept(File pathname) {

 return pathname.name.endsWith(".aar")

 }

 }).each { item ->

 String aarName = item.name.substring(0, item.name.length() - 4)

 String[] aarInfo = aarName.split("-")

 String sha1 = getFileSha1(item)

 String md5 = getFileMD5(item)

 String fromStr = item.path

 String intoStr = aarPath + "/" + aarInfo[0].replace(".", "/") + "/" + aarInfo[1] + "/" + aarInfo[2]

 String newName = aarInfo[1] + "-" + aarInfo[2] + ".aar"

 println("localMavenPath: " + localMavenPath)

 println("aar: " + aarInfo + " file sha1:" + sha1 + " md5:" + md5)

 println("aarPath: " + aarPath)

 println("intoStr: " + intoStr)

 println("newName: " + newName)

 println("fromStr: " + fromStr)

 println("intoStr: " + intoStr)
project.copy {

 from fromStr

 into intoStr

 rename(item.name, newName)

 }

project.file(intoStr + "/" + newName + ".md5").write(md5)

 project.file(intoStr + "/" + newName + ".sha1").write(sha1)

String pomPath = intoStr + "/" + newName.substring(0, newName.length() - 4) + ".pom"

 project.file(pomPath).write(createPomStr(aarInfo[0], aarInfo[1], aarInfo[2]))

 project.file(pomPath + ".md5").write(getFileMD5(project.file(pomPath)))

 project.file(pomPath + ".sha1").write(getFileSha1(project.file(pomPath)))

String metadataPath = project.file(intoStr).getParentFile().path + "/maven-metadata.xml"

 project.file(metadataPath).write(createMetadataStr(aarInfo[0], aarInfo[1], aarInfo[2]))

 project.file(metadataPath + ".md5").write(getFileMD5(project.file(metadataPath)))

 project.file(metadataPath + ".sha1").write(getFileSha1(project.file(metadataPath)))

 dependencies {

 implementation "${aarInfo[0]}:${aarInfo[1]}:${aarInfo[2]}"

 }

 }

 }

}

static String createMetadataStr(String groupId, String artifactId, String version) {

 return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +

 "<metadata>\n" +

 " <groupId>$groupId</groupId>\n" +

 " <artifactId>$artifactId</artifactId>\n" +

 " <versioning>\n" +

 " <release>$version</release>\n" +

 " <versions>\n" +

 " <version>$version</version>\n" +

 " </versions>\n" +

 " <lastUpdated>${new Date().format('yyyyMMdd')}000000</lastUpdated>\n" +

 " </versioning>\n" +

 "</metadata>\n"

}

static String createPomStr(String groupId, String artifactId, String version) {

 return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +

 "<project xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd\" xmlns=\"http://maven.apache.org/POM/4.0.0\"\n" +

 " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n" +

 " <modelVersion>4.0.0</modelVersion>\n" +

 " <groupId>$groupId</groupId>\n" +

 " <artifactId>$artifactId</artifactId>\n" +

 " <version>$version</version>\n" +

 " <packaging>aar</packaging>\n" +

 "</project>\n"

}

static String getFileSha1(File file) {

 FileInputStream input = null

 try {

 input = new FileInputStream(file)

 MessageDigest digest = MessageDigest.getInstance("SHA-1")

 byte[] buffer = new byte[1024 * 1024 * 10]

int len

 while ((len = input.read(buffer)) > 0) {

 digest.update(buffer, 0, len)

 }

 String sha1 = new BigInteger(1, digest.digest()).toString(16)

 int length = 40 - sha1.length()

 if (length > 0) {

 for (int i = 0; i < length; i++) {

 sha1 = "0" + sha1

 }

 }

 return sha1

 }

 catch (IOException e) {

 System.out.println(e)

 }

 catch (NoSuchAlgorithmException e) {

 System.out.println(e)

 }

 finally {

 try {

 if (input != null) {

 input.close()

 }

 }

 catch (IOException e) {

 System.out.println(e)

 }

 }

}

static String getFileMD5(File file) {

 FileInputStream input = null

 try {

 input = new FileInputStream(file)

 MessageDigest digest = MessageDigest.getInstance("MD5")

 byte[] buffer = new byte[1024 * 1024 * 10]

int len

 while ((len = input.read(buffer)) > 0) {

 digest.update(buffer, 0, len)

 }

 String md5 = new BigInteger(1, digest.digest()).toString(16)

 int length = 32 - md5.length()

 if (length > 0) {

 for (int i = 0; i < length; i++) {

 md5 = "0" + md5

 }

 }

 return md5

 }

 catch (IOException e) {

 System.out.println(e)

 }

 catch (NoSuchAlgorithmException e) {

 System.out.println(e)

 }

 finally {

 try {

 if (input != null) {

 input.close()

 }

 }

 catch (IOException e) {

 System.out.println(e)

 }

 }

}

My colleague tried comparing the performance with Hosting View Controller to determine the better approach for us to pursue.

From the experiment, my approach proves to be more efficient — less RAM usage, lower CPU usage, and most importantly, greater flexibility in rendering UI on Flutter rather than creating a completely new UI for each platform. However, if you already have a UI in Native, I might consider using hosted native views.

For anyone interested in accessing the code and implementing their own ML, I have provided a sample code below. The sample includes examples and handles camera-related tasks such as on/off and lifecycle management. All you need to do is connect it to your own SDK and utilize the provided functions to send feedback back to Flutter.

Search for TODO: and replace it with your own implementation.

Below is a demonstration highlighting that even the iPhone 6s Plus, as shown in my last video, couldn’t perform FaceLiveness. However, with the new implementation, I can successfully pass liveness detection.

Below is the time stamp for my video:

*   At 0:10, I showcase that the app is built with Flutter by revealing my device’s home screen and highlighting the development process on my Mac
*   At 0:21, I wave at the camera to demonstrate that there’s no lag, even with my iPhone 6s Plus
*   At 0:24, I deliberately move my face out of the frame to showcase the system’s ability to detect the absence of a face
*   At 0:30, I cover my eyes to demonstrate that the system can still detect human faces without eyes and won’t proceed further
*   At 0:52, due to a slower response on my device, I perform deliberate eye-closing and opening actions instead of a quick blink. This workaround is necessary for slower devices like my iPhone 6s Plus, which has a response time of around 1.5 seconds compared to the faster response of about 0.4 seconds on iPhone X or newer models.
*   At 1:00, the Liveness SDK returns an image indicating confidence that it’s a real human face, an image which I will utilize for a Face Comparison on the server side

That wraps up everything, and I believe this is the final solution for my camera with ML. I don’t foresee further improvements unless I venture into the Native development. However, my next task involves enhancing our QR code reader in Flutter. While mobile_scanner is already fast and usable without any issues, our team aims to achieve native-level speed. In the next article, I’ll detail the implementation of Flutter, communication with Native, and assess whether the performance surpasses that of mobile_scanner. Let’s find out!

Currently, KBTG Face Liveness which I used in the video is PAD Level 2 which is the maximum test result so far, so we can anti-spoof on par with the world standard. ⸜(｡˃ ᵕ ˂ )⸝♡

Press enter or click to view image in full size

![Image 5](https://miro.medium.com/v2/resize:fit:700/1*PyO3-Qi0U4QUL0OgEjSEYQ.png)