[

![Alexey Kutovenko](https://miro.medium.com/v2/resize:fill:32:32/0*fOgpcGgITTTVlh7h.)



](https://medium.com/@kutovenko?source=post_page---byline--645791c312fa---------------------------------------)

3 min read

Oct 14, 2022

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*0h8e7K6qsIG6fv7BchwHEg.png)

## VOSK specifications

VOSK is a free library maid by Alpha Cephei for offline speech recognition. VOSK provides a number of pre-trained models for different languages.There are Small (30…100Mb) and Big (300…1300Mb.) models. Small models are for mobile and Big are for backend use.

VOSK has number of libraries for different planforms including iOS and Android which can be implemented in Flutter app with the use of method channels. There are few in-development Flutter plugins that already done that work for us. They are shipped with basic examples.

They are almost identical inside. In both cases you will work with VoskFlutterPlugin class that acts as entry point to the recognition engine.

There are three options: to link to the GitHub repository, to clone the code and link it locally or use the code as an example and write your own wrapper class.

## Implementation

Main steps are:

1.  Download desired pre-trained models from [https://alphacephei.com/vosk/models](https://alphacephei.com/vosk/models)
2.  Unpack and initialize the model in your app
3.  Implement your business logic inside VOSK callbacks

There’s no need to build a test application from scratch as we can use example applications from packages. Let’s get strictly to some nuances.

## Get Alexey Kutovenko’s stories in your inbox

Join Medium for free to get updates from this writer.

Remember me for faster sign in

We have three callbacks: onPartialResult, onResult, onFinalResult. OnPartialResult returns stream of freshly recognized words, while onResult and onFinalResult look for pauses in person’s speech and then fire more decent and optimized result of the recognition. They work a bit differently on iOS and Android platforms.

OnPartialResult implementation is pretty straightforward, the only trick is to know that VOSK uses ‘nun’ as a filler for empty result. That may become a problem for example for German language models. As this callback works frequently it will be nice to omit unnecessary calls with some checks.

void onPartialResult(dynamic data) {  
  if (data == null ||  
      jsonDecode(data)\['partial'\] == null ||  
      jsonDecode(data)\['partial'\] == '') {  
    return;  
  } else {  
    String decoded = jsonDecode(data)\['partial'\];  
    //VOSK returns 'nun' in this callback if no voice is recognized  
    if (decoded == state.decoded || decoded == 'nun') {  
      return;  
    }  
    //Here we are able to operate with decoded data  
    logger.i('onPartial decoded: $decoded');  
  }  
}

onResult implementation needs more attention. Firstly, the data model and field name are different for iOS and Android. So, platform check should be performed.

void onResult(dynamic data) {  
 //The result of recognition that should be handled with state       //management tool of your choice  
  List<String> decodedSplitted = \[\];

  if (Platform._isAndroid_) {  
    //VOSK returns 'nun' in this callback if no voice is recognized  
    if (data == null ||  
        jsonDecode(data)\['text'\] == null ||  
        jsonDecode(data)\['text'\] == '' ||  
        jsonDecode(data)\['text'\] == 'nun') {  
      return;  
    }

    final decoded = jsonDecode(data)\['text'\];  
    decodedSplitted = decoded.split(' ');  } else if (Platform._isIOS_) {  
    if (data == null || jsonDecode(data)\['alternatives'\] == null) {       return;  
  }    final decoded = jsonDecode(data)\['alternatives'\] as List<dynamic>;

    final alternatives =  
        decoded.map((a) => Alternative(a\['text'\], a\['confidence'\])).toList();    //Find out if VOSK has no alternatives  
    if (alternatives.isEmpty || alternatives\[0\].text.isEmpty) {  
      return;  
    }  
    //Find out the best VOSK alternative  
    decodedSplitted = alternatives.last.text.split(' ');  
  }  
}

On iOS alternatives are available. It is list of results sorted by confidence. The use of alternatives is optional but If your tests show that they are able to improve recognition quality in your tasks — why not?

## Quality improvement ideas

Voice recognition is a bit tricky to test and improve because it is hard to guarantee the same input during iterations. It will be nice idea to use audiofiles instead of natural speech during tests. The main tool in the search for improvements is logging.

What steps can be performed?

1.  Play with VOSK ‘alternatives’ data as shown above.
2.  VOSK can produce a number of false negative results. So, if the goal is to compare recognized text with the saved one, it may be better to use some algorithms for finding string similarity on top of VOSK results and skip some minor mistakes. Take a look at [Dice’s Coefficient](https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient) or [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance). There are some ready implementations for Dart: [https://pub.dev/packages/string\_similarity](https://pub.dev/packages/string_similarity) [https://pub.dev/packages/dart\_levenshtein](https://pub.dev/packages/dart_levenshtein)
3.  VOSK models are trained mostly with the use of audiobooks. Many of them are not read by humans. If your domain is special it is possible to train your own model with the use of Kaldi. Here are the docs: [https://alphacephei.com/vosk/adaptation](https://alphacephei.com/vosk/adaptation)