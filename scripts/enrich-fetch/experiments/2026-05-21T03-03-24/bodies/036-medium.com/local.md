[

![Lyndsey Scott](https://miro.medium.com/v2/da:true/resize:fill:64:64/0*79XsRTInZ2m8APJI)



](https://medium.com/@lyndseyscott?source=post_page---byline--6d299b7fff4d---------------------------------------)

20 min read

Sep 13, 2020

\--

When I came up with an app idea requiring speech recognition technology, I tried as many Automatic Speech Recognition (ASR) tools I could find. While weighing my options, I struggled to balance cost with quality, until coming across the [KeenASR SDK](https://keenresearch.com/keenasr-docs), a software development kit for on-device speech recognition developed by [Keen Research](https://keenresearch.com/).

## Why KeenASR Was My #1 Pick

For context, my particular app, [Speak2Scroll](https://apps.apple.com/us/app/id1515041157), is a speech recognition based teleprompter that scrolls in time with the user’s spoken words; so I needed a speech recognition tool capable of supporting this particular use case.

Unlike Apple’s native Speech framework which (1) only recognizes 60 seconds of audio at a time and (2) may limit devices and apps to a limited number of recognitions per day, [KeenASR SDK](https://keenresearch.com/keenasr-docs) allows for unlimited recognition; so although Apple’s Speech framework is free and would have been accurate enough for my use case, it would have been unable to process my users’ potentially lengthy and continuous spoken text.

I also tried several third party libraries including my personal runner-up, the Google Cloud Speech API. Google Cloud’s recognition accuracy was superior to most 3rd party options, but the amount I would have had to charge users to cover its pay per usage pricing model would have been entirely unreasonable.

Ultimately, I settled on KeenASR because:

1.  It produces quick and accurate results entirely on-device and offline ensuring the user’s privacy.
2.  [Keen Research](https://keenresearch.com/) offers various cost model options, such as charging an annual fee or taking a share of app revenue. Because they license their software for a predictable cost instead of charging per recognition, I could potentially make a profit off my software in the long run regardless of the number of speech recognition requests.
3.  The SDK’s well [documented](https://keenresearch.com/keenasr-docs) and [easy to implement](https://keenresearch.com/keenasr-docs/keenasr-ios-quick-start.html).
4.  The [free version of KeenASR SDK](https://keenresearch.com/keenasr-docs/downloads.html) is fully functional other than the fact that it runs for only 15 minutes at a time, an unlimited number of times; so I was able to fully confirm it worked for my app’s use case before buying the license.
5.  It works on both iOS and Android so I can eventually make my app available on both platforms.

Points #1 and #2 alone were hard to find in any other ASR SDK and were probably most crucial to my decision to go with KeenASR since my app needed to process large chunks of continuous audio.

**_Project Requirements:_** _The SDK supports iOS 10 or later.__Keen Research recommends targeting iPhone 6 or later (and equivalent iPads) for most applications. The CPU in older devices may not have sufficient processing power to run the language bundles' Deep Neural Network acoustic models._

## Getting Started

Download/clone [the sample project](https://github.com/LyndseyScott/KeenASRDemo). (You may clone the repository using [these instructions](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/cloning-a-repository).)

Take a quick look through the **KeenASRDemo** directory’s contents and you’ll see that it contains a SwiftUI and Storyboard project, both written in Apple’s Swift programming language. Likewise there’s a SwiftUI and Storyboard version of the tutorial within this article. You may follow one or both tutorial versions as you see fit. Note that both projects essentially create the same app with similar code, so the tutorials are almost identical aside from the way they interact with the UI.

Open the starter project of your choosing and feel free to take a look at its files to get acclimated. When you’re ready, build and run the app on either a simulator or device to see the current code in action.

Starter app

Once the app launches, you should see a white rectangle approximately halfway down the screen, a list of actions and colors below it, and a toggle-able **KeenASR Off/On** label and switch in the top right corner. The app currently does very little, but in this tutorial, you’ll implement **KeenASR** to recognize spoken action-color command combinations when the listening switch is in the on position. Then using that recognized speech, the app will update the interface to display the recognized spoken text and animate the rectangle to represent the matching color and action accordingly.

## How To Install The SDK

Download then unzip [the trial framework](http://keenresearch.com/keenasr-downloads/KeenASR-Framework.tar.gz) and [English language ASR Bundle](http://keenresearch.com/keenasr-downloads/keenB2mQT-nnet3chain-en-us.tgz). (Other language bundles are [available upon request](mailto:info@keenresearch.com). Feel free to include another KeenASR language bundle in place of the English bundle if you so choose.)

Note: By downloading the SDK or ASR Bundles you agree to [the Trial SDK Licensing Agreement](https://keenresearch.com/keenasr-docs/keenasr-trial-sdk-licensing-agreement.html).

## Framework Installation

Copy and paste **KeenASR.framework** folder contained in the unzipped framework directory, ex. **KeenASR-Framework-trial-v1\_8-Release/KeenASR.framework**, into your working project’s directory. If you intend to do the SwiftUI version of the tutorial, copy and paste the framework into the SwiftUI Starter Project at **KeenASRDemo/SwiftUI Project/Starter Project**. If you intend to do the Storyboard version of the tutorial, copy and paste the framework into the Storyboard Starter Project at **KeenASRDemo/Storyboard Project/Starter Project**.

Press enter or click to view image in full size

Add KeenASR.framework to your starter project’s root directory

Next, open your chosen starter project’s **KeenASRDemo.xcodeproj** in Xcode. Tap the **KeenASRDemo** target at the top of the left-hand Project Navigator panel, navigate to the target’s **General** configuration page, scroll down to the **Frameworks, Libraries, and Embedded Content** section then tap the **\+** icon at the bottom of the table.

Press enter or click to view image in full size

Add KeenASR Framework to project — Step #1

Open the **Add Other…** drop-down menu in the bottom left, tap **Add Files…**, navigate to the working project’s directory, select **KeenASR.framework** then tap **Open** to add it to your project.

Press enter or click to view image in full size

Add KeenASR Framework to project — Step #2

If you build the app at this point, you may get an error stating either 1. **_Building for iOS Simulator, but the linked and embedded framework ‘KeenASR.framework’ was built for iOS._** or 2. **_Signing for “KeenASRDemo” requires a development team. Select a development team in the Signing & Capabilities editor._** This is because 1. KeenASR SDK will not run on a simulator and 2. to run an app on a physical device, you need to select a development team for signing.

To get rid of the first error, connect your iOS device to your computer then in the Scheme Menu on Xcode’s top Workspace Toolbar, immediately to the right of the Stop Build button, select your iOS device as a build target.

Press enter or click to view image in full size

Set device to build target

After updating the build target, build the app again and you may see the second error. To get rid of it, navigate to your target’s **Signing & Capabilities** tab and if you haven’t already logged in, tap **Add Account…** next to **Team** to login in with your Apple ID. If you’re enrolled in the [Apple Developer Program](https://developer.apple.com/programs/), select a valid development team for signing; otherwise, if you are not a member of the [Apple Developer Program](https://help.apple.com/xcode/mac/current/#/dev13f7a8004), Xcode will automatically create a [personal team](https://help.apple.com/xcode/mac/current/#/dev17411c009) for you.

Press enter or click to view image in full size

Sign app

After updating these settings, the app should build successfully.

## ASR Bundle Installation

Next, to add the ASR language bundle, ex. **keenB2mQT-nnet3chain-en-us**, drag and drop it into Xcode’s Project Navigator. The **Choose options for adding these files** window should pop up. Check **Copy items if needed**, choose the **Create folder references** option beside **Added folders:**, check the project target next to **Add to targets:** then tap **Finish**. The ASR Bundle should then appear as a blue folder in the Project Navigator.

Add ASR Language Bundle to Project

## Configure Info.plist

Apple requires all apps that access the microphone to provide the user with an explanation for that microphone access. To do this, open **Info.plist**. Hover your mouse’s pointer over the top row of the table, the **Information Property List** row, and **+** should appear. Tap that **+** then add **NSMicrophoneUsageDescription** as a new key. If entered correctly, tapping enter should make the text change to **Privacy - Microphone Usage Description**. In that same row’s value column add an explanation, such as “The speech recognition feature in this app requires access to the microphone.”

Press enter or click to view image in full size

Add NSMicrophoneUsageDescription value to Info.plist

Next, depending on your preferred UI framework, you can follow the Swift UI tutorial immediately below or scroll down for the UIKit Storyboard tutorial. Either way, here are the high-level steps involved in KeenASR’s general workflow:

1.  Initialize KeenASR SDK.
2.  Create one or more decoding graphs, which will be used for recognition. Decoding graphs are built using a list of phrases, which define what can be recognized.
3.  Prepare for listening using one of the decoding graphs.
4.  Start listening.
5.  Respond to recognized text in partial result and/or final result callbacks.

## SwiftUI Tutorial

Within the **SwiftUI Project/Starter** Xcode project, open **KIOSController.swift.** Underneath the **AVFoundation**, **Combine** and **SwiftUI** import statements near the top of the class, add:

import KeenASR

to import the KeenASR Framework.

Next right below the classes other stored properties and right above **init()**, add:

let recognizer: KIOSRecognizer? = {  
    // 1  
    KIOSRecognizer.initWithASRBundle("keenB2mQT-nnet3chain-en-us")  
    // 2  
    return KIOSRecognizer.sharedInstance()  
}()

Here you create a [**KIOSRecognizer**](https://keenresearch.com/keenasr-ios-reference-docs/Classes/KIOSRecognizer.html) instance to “manage recognizer resources and provide speech recognition capabilities to your application” by:

1.  Initializing the recognizer with the ASR language bundle, which contains the acoustic model and configuration files to aid recognition.
2.  Returning the shared **KIOSRecognizer** instance to store it in the **recognizer** class property.

Then within the **init**() function add the following underneath **super.init()**:

// 1  
guard let recognizer = recognizer else {  
    return  
}  
// 2  
recognizer.setVADParameter(.timeoutEndSilenceForGoodMatch, toValue: 0.5)  
recognizer.setVADParameter(.timeoutEndSilenceForAnyMatch, toValue: 0.5)  
recognizer.setVADParameter(.timeoutForNoSpeech, toValue: .infinity)  
recognizer.setVADParameter(.timeoutMaxDuration, toValue: .infinity)

When the app runs **init()** to initialize **KIOSController** following app launch, this code continues setting up the **KIOSRecognizer** stored property by:

1.  Unwrapping **recognizer** to confirm it initialized successfully.
2.  Setting the following [**KIOSVadParameter**s](https://keenresearch.com/keenasr-ios-reference-docs/Constants/KIOSVadParameter.html), i.e. voice activity detection parameters, for the shared **KIOSRecognizer** to define the conditions under which the recognizer will automatically stop listening:

*   To end recognition shortly after a good match is found, set **KIOSVadTimeoutEndSilenceForGoodMatch** to 0.5. This will finalize recognition after half a second of silence if the recognizer has already found a high probability match. (If not explicitly set, **KIOSVadTimeoutEndSilenceForGoodMatch** would default to 1 second.)
*   Similarly, set **KIOSVadTimeoutEndSilenceForAnyMatc**h to 0.5 in order to finalize recognition after half a second of silence if the recognizer has already found any match, regardless of its probability. (If not explicitly set, **KIOSVadTimeoutEndSilenceForAnyMatch** would default to 2.)
*   In this particular app, we want speech recognition to continue indefinitely as long as the listening switch is on; so set **KIOSVadTimeoutForNoSpeech**’s value to **.infinity**. This way, the recognizer continues past **KIOSVadTimeoutForNoSpeech**’s 10 second default value and instead never finalizes recognition before hearing the user speak.
*   Similarly, set **KIOSVadTimeoutMaxDuration** to **.infinity** in order to prevent recognition from finalizing if neither a “good” or “any” match has been found. This is effectively the upper bound on the duration of recognition and defaults to 20 seconds.

**KIOSVadParameter Tips:**\- In this demo we are listening for short words/commands, which is  
  why it's acceptable to set small values for  
  **KIOSVadTimeoutEndSilenceForGoodMatch** and  
 ** KIOSVadTimeoutEndSilenceForAnyMatch** in this case since there's  
  little chance the user will pause between words and thus end  
  recognition prematurely.   In more complex use cases, you could even  
  dynamically change the **KIOSVadTimeoutEndSilenceForGoodMatch** and  
  **KIOSVadTimeoutEndSilenceForAnyMatch** values within the partial  
  result callback depending on when/if it returns complete results  
  before recognition is finalized. For more details see the   
  [KeenASR documentation](https://keenresearch.com/keenasr-docs/keenasr-getting-started.html#start-and-stop-listening).\- Here are some scenarios in which you might want to keep the  
  **KIOSVadTimeoutForNoSpeech** and/or **KIOSVadTimeoutMaxDuration** 10  
  second and/or 20 second default values respectively:    • If your app requires the user's speech input at a certain  
      point in time during the app's execution, you might keep  
      **KIOSVadTimeoutForNoSpeech**'s default value and re-prompt the  
      user if they fail to say anything after the 10 second time  
      limit.    • If you want to continue listening until you receive speech  
      input, you could keep **KIOSVadTimeoutForNoSpeech** and  
      **KIOSVadTimeoutMaxDuration**'s default values then restart  
      listening after receiving an empty final result.

Still within **init()** and right after the code you just added, insert:

// 1  
if KIOSDecodingGraph.decodingGraph(withNameExists:   
    decodingGraphName, for: recognizer) {  
    print("Decoding graph already exists")  
} else {  
    // 2  
    let commands = allCommands()  
    // 3  
    if !KIOSDecodingGraph.createDecodingGraph(fromSentences:   
        commands, for: recognizer, andSaveWithName:   
        decodingGraphName) {  
        print("Error occured while creating decoding graph from the text")  
    }  
}  
// 4  
if !recognizer.prepareForListeningWithCustomDecodingGraph(withName:  
    decodingGraphName) {  
    print("Error preparing for listening with custom decoding graph")  
}

1\. In order to recognize language, ASR uses a [decoding graph](https://keenresearch.com/keenasr-docs/keenasr-decoding-graphs-acoustic-models.html) which combines a language model with the acoustic models, lexicon and various configuration files contained in the language bundle. In this particular bit of code, you first check to see if a decoding graph with name **decodingGraphName**, a constant initialized towards the top of the class, already exists.

2\. If step #1 determines that the decoding graph already exists, you don’t need to create it again since decoding graphs persist in the filesystem; so you can skip to step #3. Otherwise, if the decoding graph hasn’t been created yet, get the list of valid commands from the **allCommands()** function pre-coded at the top of the **KIOSController** extension located a little further down the page. **allCommands()** takes all the string values stored in the **actions** and **colors** arrays defined towards the top of the class, then combines each action with each color to produce and return the full list of valid commands.

3\. Create a new decoding graph named **decodingGraphName** from the sentences/phrases/words you expect the user to say, i.e. the **commands** string array in this case. If the **KIOSDecodingGraph**’s **createDecodingGraphFromSentences:forRecognizer:andSaveWithName:** method returns false, the decoding graph failed to initialize; if true, the initialization succeeded.

**_Note:_** _You don’t necessarily need to check for the decoding graph’s existence (step 1) before creating the decoding graph (step 3) because creating the decoding graph would simply overwrite the previous decoding graph of the same name. However, because decoding graph creation might be relatively slow on older devices (it can take on the order of 10–20 seconds for decoding graphs with several thousand words), it’s more efficient to only create the decoding graph when necessary._

4\. Prepare the **KIOSRecognizer** for listening with the **decodingGraphName** custom decoding graph. If the **KIOSRecognizer**’s **prepareForListeningWithCustomDecodingGraphWithName:** method returns false, the recognizer failed to prepare for listening; otherwise if it returns true, the recognizer is ready to listen so you can successfully launch recognition once the user toggles the switch.

So within **toggleListening(\_:)**, the function triggered when the user toggles the switch, start out by adding this logic:

// 1   
listeningOn = isOn  
// 2  
if isOn {} else {}

With this code, you:

1.  Store the UISwitch’s current **isOn** boolean value (true if on, false if not) within the **listeningOn** class variable.
2.  Create the on/off conditional blocks where you’ll next add the code to execute depending on whether the switch is in the on or off position.

Within the **if isOn** block, add:

// 1  
switch AVAudioSession.sharedInstance().recordPermission {  
// 2  
case AVAudioSessionRecordPermission.granted:  
    recognizer?.startListening()  
// 3  
case AVAudioSessionRecordPermission.denied:  
    return  
// 4  
case AVAudioSessionRecordPermission.undetermined:  
    AVAudioSession.sharedInstance().requestRecordPermission({  
        (granted) in  
        if granted {  
            self.recognizer?.startListening()  
        } else {  
            return  
        }  
    })  
// 5  
@unknown default:  
    return  
}

So if the user has toggled the listening switch on:

1.  Determine whether the user’s granted the app permission to access the device’s microphone input or not by accessing the **AVAudioSession.sharedInstance().recordPermission** value.
2.  If the user has in fact granted the app microphone permission, launch audio recognition with **recognizer?.startListening()**.
3.  If the user has denied microphone permission, don’t launch audio recognition.
4.  If the user has neither granted or denied the app microphone permission, call **requestRecordPermission** and the app will present the user with a microphone permission request alert containing whatever **NSMicrophoneUsageDescription** you previously added to **Info.plist**. Then depending on whether they grant or deny permission, launch audio recognition or not respectively.
5.  Don’t launch audio recognition unless the **recordPermission** status is either .**granted**, .**denied** or .**undetermined**.

Within **toggleListening(\_:)**’s final else block, add:

// 1  
recognizer?.stopListening()   
// 2   
spokenText = ""  
action = nil  
color = nil  
didChange.send(())

So if the user’s toggled the listening switch into the off position:

1.  Turn off the audio recognizer.
2.  Clear out all the **KIOSController** variables used in **ContentView.swift**, then send the changes to **ContentView** through the **didChange** PassthroughSubject in order to clear out the recognized spoken text, action and color representations from the SwiftUI.

Next, to access the KIOS recognition results, you’ll add the **KIOSRecognizerDelegate** protocol and implement some of its methods. Between the **class KIOSController : NSObject, ObservableObject** block’s final bracket and **extension KIOSController**, add:

extension KIOSController : KIOSRecognizerDelegate {  
    // 1  
    func unwindAppAudioBeforeAudioInterrupt() {  
        print(#function)  
    }  
    // 2  
    func recognizerReadyToListen(afterInterrupt   
        recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
    // 3  
    func recognizerPartialResult(\_ result: KIOSResult,   
        for recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
    // 4  
    func recognizerFinalResult(\_ result: KIOSResult,   
        for recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
}

The protocol methods in this extension handle the following callbacks:

1.  **unwindAppAudioBeforeAudioInterrupt**, **KIOSRecognizerDelegate**’s only required method, is called after an audio interrupt occurs (ex. incoming call, the app going into the background) and before **recognizer** starts unwinding its audio stack.
2.  **recognizerReadyToListenAfterInterrupt:** is called when the recognizer is ready to listen again post-audio interrupt.
3.  **recognizerPartialResult:forRecognizer:** is called when the recognizer detects any provisional recognition results before the recognition is finalized, i.e. before one of the VAD rules has triggered. This can provide you with real-time “streaming” results as the user speaks.
4.  **recognizerFinalResult:forRecognizer:** is called when the recognizer has finished the recognition and has stopped listening because one of the VAD rules has triggered. Final results will also contain confidence scores and word timing information.

Within **recognizerReadyToListenAfterInterrupt:**, after **print(#function)**, insert:

if listeningOn &&  
    recognizer.recognizerState != .listening {  
    recognizer.startListening()  
}

to restart listening after an audio interrupt if 1. the listening switch is on (i.e. **listeningOn == true**) and 2. the recognizer isn’t currently listening.

Within **recognizerFinalResult:forRecognizer:**, after **print(#function)**, insert:

// 1  
guard listeningOn else {  
    return  
}  
// 2  
processSpokenText(result.cleanText)  
// 3   
if recognizer.recognizerState != .listening {  
    recognizer.startListening()  
}

1.  If and only if the listening switch is on, perform steps 2 & 3.
2.  Process the recognized text and update the UI appropriately using the pre-coded **processSpokenText(\_ :)** function in the next **KIOSController** extension. **processSpokenText(\_ :)** takes in the final, token free, i.e. “clean,” [**KIOSResult**](https://keenresearch.com/keenasr-ios-reference-docs/Classes/KIOSResult.html) string and updates the SwiftUI with the newly recognized spoken text, action and color.
3.  If **recognizer** is no longer listening, as should be the case immediately after **recognizerFinalResult:forRecognizer:** is invoked, restart listening since the listening switch is still on as step 1’s already confirmed.

Last but not least, scroll back up to **init()** and below the **.setVADParameters** items, insert:

recognizer.delegate = self

so that **recognizer** will appropriately trigger the **KIOSRecognizerDelegate** protocol methods you just added.

Now build and run the app on a physical iOS device. (Note: KeenASR SDK will not run on a simulator and you will get linker errors if you attempt to do so.) Turn on the listening switch, speak some action-color phrase combos and your app should successfully update the UI in response to the recognized speech!

Final app

If you run into any issues, check out the final project to see how yours compares.

## Storyboard Tutorial

Within the **Storyboard Project/Starter** Xcode project, open **ViewController.swift.** Underneath the **UIKit** and **AVFoundation** import statements near the top of the class, add:

import KeenASR

to import the KeenASR Framework.

Next right below the classes other stored properties and right above **viewDidLoad()**, add:

let recognizer: KIOSRecognizer? = {  
    // 1  
    KIOSRecognizer.initWithASRBundle("keenB2mQT-nnet3chain-en-us")  
    // 2  
    return KIOSRecognizer.sharedInstance()  
}()

Here you create a [**KIOSRecognizer**](https://keenresearch.com/keenasr-ios-reference-docs/Classes/KIOSRecognizer.html) instance to “manage recognizer resources and provide speech recognition capabilities to your application” by:

1.  Initializing the recognizer with the ASR language bundle, which contains the acoustic model and configuration files to aid recognition.
2.  Returning the shared **KIOSRecognizer** instance to store it in the **recognizer** class property.

Then within the **viewDidLoad()** function add the following underneath **super.viewDidLoad()**:

// 1  
guard let recognizer = recognizer else {  
    return  
}  
// 2  
recognizer.setVADParameter(.timeoutEndSilenceForGoodMatch, toValue: 0.5)  
recognizer.setVADParameter(.timeoutEndSilenceForAnyMatch, toValue: 0.5)  
recognizer.setVADParameter(.timeoutForNoSpeech, toValue: .infinity)  
recognizer.setVADParameter(.timeoutMaxDuration, toValue: .infinity)

Once the app has loaded **ViewController**’s view, this code continues setting up the **KIOSRecognizer** stored property by:

1.  Unwrapping **recognizer** to confirm it initialized successfully.
2.  Setting the following [**KIOSVadParameter**s](https://keenresearch.com/keenasr-ios-reference-docs/Constants/KIOSVadParameter.html), i.e. voice activity detection parameters, for the shared **KIOSRecognizer** to define the conditions under which the recognizer will automatically stop listening:

*   To end recognition shortly after a good match is found, set **KIOSVadTimeoutEndSilenceForGoodMatch** to 0.5. This will finalize recognition after half a second of silence if the recognizer has already found a high probability match. (If not explicitly set, **KIOSVadTimeoutEndSilenceForGoodMatch** would default to 1 second.)
*   Similarly, set **KIOSVadTimeoutEndSilenceForAnyMatc**h to 0.5 in order to finalize recognition after half a second of silence if the recognizer has already found any match, regardless of its probability. (If not explicitly set, **KIOSVadTimeoutEndSilenceForAnyMatch** would default to 2.)
*   In this particular app, we want speech recognition to continue indefinitely as long as the listening switch is on; so set **KIOSVadTimeoutForNoSpeech**’s value to **.infinity**. This way, the recognizer continues past **KIOSVadTimeoutForNoSpeech**’s 10 second default value and instead never finalizes recognition before hearing the user speak.
*   Similarly, set **KIOSVadTimeoutMaxDuration** to **.infinity** in order to prevent recognition from finalizing if neither a “good” or “any” match has been found. This is effectively the upper bound on the duration of recognition and defaults to 20 seconds.

**KIOSVadParameter Tips:**\- In this demo we are listening for short words/commands, which is  
  why it's acceptable to set small values for  
  **KIOSVadTimeoutEndSilenceForGoodMatch** and  
 ** KIOSVadTimeoutEndSilenceForAnyMatch** in this case since there's  
  little chance the user will pause between words and thus end  
  recognition prematurely.

    In more complex use cases, you could even dynamically change the  
  **KIOSVadTimeoutEndSilenceForGoodMatch** and  
  **KIOSVadTimeoutEndSilenceForAnyMatch** values within the partial  
  result callback depending on when/if it returns complete results  
  before recognition is finalized. For more details see the   
  [KeenASR documentation](https://keenresearch.com/keenasr-docs/keenasr-getting-started.html#start-and-stop-listening).

\- Here are some scenarios in which you might want to keep the  
  **KIOSVadTimeoutForNoSpeech** and/or **KIOSVadTimeoutMaxDuration** 10  
  second and/or 20 second default values respectively:    • If your app requires the user's speech input at a certain  
      point in time during the app's execution, you might keep  
      **KIOSVadTimeoutForNoSpeech**'s default value and re-prompt the  
      user if they fail to say anything after the 10 second time  
      limit.    • If you want to continue listening until you receive speech  
      input, you could keep **KIOSVadTimeoutForNoSpeech** and  
      **KIOSVadTimeoutMaxDuration**'s default values then restart  
      listening after receiving an empty final result.

Still within **viewDidLoad()** and right after the code you just added, insert:

// 1  
if KIOSDecodingGraph.decodingGraph(withNameExists:  
    decodingGraphName, for: recognizer) {  
    print("Decoding graph already exists")  
} else {  
    // 2  
    let commands = allCommands()  
    // 3  
    if !KIOSDecodingGraph.createDecodingGraph(fromSentences:   
        commands, for: recognizer, andSaveWithName:   
        decodingGraphName) {  
        print("Error occured while creating decoding graph from the text")  
    }  
}  
// 4  
if !recognizer.prepareForListeningWithCustomDecodingGraph(withName:  
    decodingGraphName) {  
    print("Error preparing for listening with custom decoding graph")  
}

1\. In order to recognize language, ASR uses a [decoding graph](https://keenresearch.com/keenasr-docs/keenasr-decoding-graphs-acoustic-models.html) which combines a language model with the acoustic models, lexicon and various configuration files contained in the language bundle. In this particular bit of code, you first check to see if a decoding graph with name **decodingGraphName**, a constant initialized towards the top of the class, already exists.

2\. If step #1 determines that the decoding graph already exists, you don’t need to create it again since decoding graphs persist in the filesystem; so you can skip to step #3. Otherwise, if the decoding graph hasn’t been created yet, get the list of valid commands from the **allCommands()** function pre-coded at the top of the **ViewController** extension located a little further down the page. **allCommands()** takes all the string values stored in the **actions** and **colors** arrays defined towards the top of the class, then combines each action with each color to produce and return the full list of valid commands.

3\. Then create a new decoding graph named **decodingGraphName** from the sentences/phrases/words you expect the user to say, i.e. the **commands** string array in this case. If the **KIOSDecodingGraph**’s **createDecodingGraphFromSentences:forRecognizer:andSaveWithName:** method returns false, the decoding graph failed to initialize; if true, the initialization succeeded.

**_Note:_** _You don’t necessarily need to check for the decoding graph’s existence (step 1) before creating the decoding graph (step 3) because creating the decoding graph would simply overwrite the previous decoding graph of the same name. However, because decoding graph creation might be relatively slow on older devices (it can take on the order of 10–20 seconds for decoding graphs with several thousand words), it’s more efficient to only create the decoding graph when necessary._

4\. Prepare the **KIOSRecognizer** instance for listening with the **decodingGraphName** custom decoding graph. If the **KIOSRecognizer**’s **prepareForListeningWithCustomDecodingGraphWithName:** method returns false, the recognizer failed to prepare for listening; otherwise if it returns true, the recognizer is ready to listen so you can successfully launch recognition once the user toggles the switch.

So within **toggleListening(\_:)**, the function triggered when the user toggles the switch, start out by adding this logic:

if sender.isOn {} else {}

to create the on/off conditional blocks where you’ll next add the code to execute depending on whether the switch is in the on or off position.

Then within the **if sender.isOn** block, add:

// 6  
func launchAudioRecognition() {  
    DispatchQueue.main.async {  
        self.switchLabel.textColor = .black  
        self.switchLabel.text = "KeenASR On"  
        self.recognizer?.startListening()  
    }  
}  
// 1  
switch AVAudioSession.sharedInstance().recordPermission {  
// 2  
case AVAudioSessionRecordPermission.granted:  
    launchAudioRecognition()  
// 3  
case AVAudioSessionRecordPermission.denied:  
     sender.isOn = false  
// 4  
case AVAudioSessionRecordPermission.undetermined:  
    AVAudioSession.sharedInstance().requestRecordPermission({   
        (granted) in  
        if granted {  
            launchAudioRecognition()  
        } else {  
            sender.isOn = false  
        }  
    })  
// 5  
@unknown default:  
    sender.isOn = false  
}

Note that step number 6 precedes numbers 1 through 5 in the above code since the switch conditional executes before **launchAudioRecognition**. So if the user’s toggled the listening switch on:

1\. Determine whether the user’s granted/denied the app permission to access the device’s microphone input or not by accessing the **AVAudioSession.sharedInstance().recordPermission** value.

2\. If the user has granted the app microphone permission, call **launchAudioRecognition()** to launch audio recognition.

3\. If the user has denied microphone permission, don’t launch audio recognition and turn off the listening switch instead.

4\. If the user has neither granted or denied the app microphone permission, present an alert containing whatever **NSMicrophoneUsageDescription** you previously added to the **Info.plist** to ask for their permission to access the microphone. Depending on whether they grant or deny permission, call **launchAudioRecognition()** or not respectively.

5\. Don’t launch audio recognition unless the **recordPermission** status matches one of the three previous cases.

6\. When invoked, **launchAudioRecognition()** changes the switch’s gray **KeenASR Off** label text to a black **KeenASR On**, starts speech recognition with **self.recognizer?.startListening().** Furthermore, as required when updating the UI, **launchAudioRecognition()** makes all UI changes on the main thread, i.e. **DispatchQueue.main.async,** after **AVAudioSession.sharedInstance().recordPermission** returns and invokes **launchAudioRecognition()** on a background thread.

Within **toggleListening(\_:)**’s final else block, insert:

// 1  
recognizer?.stopListening()   
// 2   
spokenTextLabel.text = nil  
colorView.layer.removeAllAnimations()  
colorView.backgroundColor = .white  
// 3  
switchLabel.textColor = .gray  
switchLabel.text = "KeenASR Off"

So if the user’s toggled the listening switch into the off position:

1.  Turn off the audio recognizer.
2.  Clear out the recognized spoken text, action and color representations from the UI.
3.  Change the switch label’s text back to display **KeenASR Off** in gray.

Next, to access the KIOS recognition results, you’ll add the **KIOSRecognizerDelegate** protocol and implement some of its methods. Between the **class ViewController: UIViewController** block’s final bracket and **extension ViewController**, add:

extension ViewController : KIOSRecognizerDelegate {  
    // 1  
    func unwindAppAudioBeforeAudioInterrupt() {  
        print(#function)  
    }  
    // 2  
    func recognizerReadyToListen(afterInterrupt   
        recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
    // 3  
    func recognizerPartialResult(\_ result: KIOSResult,   
        for recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
    // 4  
    func recognizerFinalResult(\_ result: KIOSResult,   
        for recognizer: KIOSRecognizer) {  
        print(#function)  
    }  
}

The protocol methods in this extension handle the following callbacks:

1.  **unwindAppAudioBeforeAudioInterrupt**, **KIOSRecognizerDelegate**’s only required method, is called after an audio interrupt occurs (ex. incoming call, the app going into the background) and before **recognizer** starts unwinding its audio stack.
2.  **recognizerReadyToListenAfterInterrupt:** is called when the recognizer is ready to listen again post-audio interrupt.
3.  **recognizerPartialResult:forRecognizer:** is called when the recognizer detects any provisional recognition results before the recognition is finalized, i.e. before one of the VAD rules has triggered. This can provide you with real-time “streaming” results as the user speaks.
4.  **recognizerFinalResult:forRecognizer:** is called when the recognizer has finished the recognition and has stopped listening because one of the VAD rules has triggered. Final results will also contain confidence scores and word timing information.

Within **recognizerReadyToListenAfterInterrupt:**, after **print(#function)**, insert:

if asrSwitch.isOn &&  
    recognizer.recognizerState != .listening {  
    recognizer.startListening()  
}

to restart listening after an audio interrupt if 1. the listening switch is on and 2. the recognizer isn’t currently listening.

Within **recognizerFinalResult:forRecognizer:**, after **print(#function)**, insert:

// 1  
guard asrSwitch.isOn else {  
    return  
}  
// 2  
processSpokenText(result.cleanText)  
// 3   
if recognizer.recognizerState != .listening {  
    recognizer.startListening()  
}

1.  If and only if the listening switch is on, perform steps 2 & 3.
2.  Process the recognized text and update the UI appropriately using the pre-coded **processSpokenText(\_ :)** function in the next **ViewController** extension. **processSpokenText(\_ :)** takes in the final, token free, i.e. “clean,” [**KIOSResult**](https://keenresearch.com/keenasr-ios-reference-docs/Classes/KIOSResult.html) string and updates the SwiftUI with the newly recognized spoken text, action and color.
3.  If **recognizer** is no longer listening, as should be the case immediately after **recognizerFinalResult:forRecognizer:** is invoked, restart listening since the listening switch is still on as step 1’s already confirmed.

Last but not least, scroll back up to **viewDidLoad()** and below the **.setVADParameters** items, insert

recognizer.delegate = self

so that **recognizer** will appropriately trigger the **KIOSRecognizerDelegate** protocol methods you just added.

Now build and run the app on a physical iOS device. (Note: KeenASR SDK will not run on a simulator and you will get linker errors if you attempt to do so.) Turn on the listening switch, speak some action-color phrase combos and your app should successfully update the UI in response to the recognized speech!

Final app

If you run into any issues, check out the final project to see how yours compares.

## Conclusion

Now that you know how to implement the [KeenASR framework](https://keenresearch.com/keenasr-docs), there are so many ways for you to apply this technology. It’s been used to teach kids to read; teach spoken languages; provide voice interactivity in games and augmented/virtual reality apps; facilitate hands-free app use with voice commands; support my own voice recognition based teleprompter app, [Speak2Scroll](https://apps.apple.com/us/app/id1515041157), etc. And as I’ve found with Speak2Scroll, the technology is flexible enough to use in ways beyond even what [Keen Research](https://keenresearch.com/) initially intended, so I encourage you to explore the possibilities.

[https://keenresearch.com](https://keenresearch.com/)