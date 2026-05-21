[

![Nat Kershaw](https://miro.medium.com/v2/resize:fill:32:32/1*BzGelYBx63x9kRvcdSdIUA.jpeg)



](https://medium.com/@worddecree?source=post_page---byline--5bf0969dd56b---------------------------------------)

8 min read

Jun 7, 2023

Learn how [ONNX Runtime](https://onnxruntime.ai/) accelerates Whisper and makes it easy to deploy on desktop, mobile, in the cloud, and even in the browser.

## What is Whisper?

The buzz around [OpenAI’s Whisper model](https://openai.com/research/whisper) is certainly loud. Whisper is a general-purpose speech recognition model, known for its ability to transcribe multiple languages as well as translate between them, in the presence of background noise and accents.

Whisper has six size variants, ranging from tiny to large. As the model size increases, accuracy improves. The more accurate models are bigger and take longer to run, so there are trade-offs, depending on your deployment needs.

ONNX Runtime gives you the best of both worlds, allowing you to run whisper locally on device when you want to keep all of your data on device for privacy, your application needs to be faster than calling out to the cloud allows, or the cost of providing a cloud service is a concern. If you need the functionality and accuracy of a larger and more featured model, permitted by the resources of the cloud, you can also do this with ONNX Runtime.

You can also switch between local and cloud with ONNX Runtime based on network quality, background noise or any other conditions that play a factor in your application quality.

## Build a fast and portable Whisper model

You can transcribe audio, with the different Whisper model sizes today, with a few lines of code, using PyTorch models hosted on HuggingFace.

from transformers import WhisperProcessor, WhisperForConditionalGeneration

model\_name = “openai/whisper-tiny-en”  
processor = WhisperProcessor.from\_pretrained(model\_name)  
model = WhisperForConditionalGeneration.from\_pretrained(model\_name)

model.config.forced\_decoder\_ids = processor.get\_decoder\_prompt\_ids(language = "en", task = "transcribe")  
input\_features = processor(speech, sampling\_rate=16000, return\_tensors="pt").input\_features   
predicted\_ids = model.generate(input\_features, max\_length=448)  
transcription = processor.batch\_decode(predicted\_ids, skip\_special\_tokens=True)

Press enter or click to view image in full size

![Diagram showing components of transcrition including audio pre processing, token generation and token decoding into string transcription](https://miro.medium.com/v2/resize:fit:700/1*q3RVn976-8bUwNldGMPwwQ.png)

HuggingFace also has an API in its optimum library that runs encoder and decoder ONNX models using ONNX Runtime, with the generation orchestration still performed in PyTorch.

from transformers import WhisperProcessor  
from optimum.onnxruntime import ORTModelForSpeechSeq2Seq

model\_name = “openai/whisper-tiny-en”  
processor = WhisperProcessor.from\_pretrained(model\_name)  
model = ORTModelForSpeechSeq2Seq.from\_pretrained(model\_name, export=True)

model.config.forced\_decoder\_ids = processor.get\_decoder\_prompt\_ids(language = "en", task = "transcribe")  
input\_features = processor(speech, sampling\_rate=16000, return\_tensors="pt").input\_features   
predicted\_ids = model.generate(input\_features, max\_length=448)  
transcription = processor.batch\_decode(predicted\_ids, skip\_special\_tokens=True)

Press enter or click to view image in full size

![Diagram showing token sequence generation with HuggingFace optimum and ONNX models for the encoder and decoder](https://miro.medium.com/v2/resize:fit:700/1*mHJ0KQJfEqTkZxLeZKFPRg.png)

But to get the best performance and the most portable solution, use ONNX Runtime and Olive to optimize and export Whisper as an all-in-one model. The all-in-one model combines the beam search orchestration and the encoder and decoder into a single ONNX model, allowing the key value data, which is calculated and re-ordered at each decoder step (performed once for every new token that is generated in the output sequence) to be optimized within a single model.

ONNX Runtime improves model latency further with operator fusions within the encoder and decoder models, kernel optimizations for CPU and GPU, as well as quantization of the model from 32 -bit floats to 8-bit integers.

In addition, the audio pre -processing and input feature generation, as well as the token decoding are included in the all-in-one model. The all-in-one model can then easily be deployed in the cloud, or locally, on your PC, on web or on mobile devices, in an application written in your language of choice.

Press enter or click to view image in full size

![Diagram showing components of the all-in-one ONNX model including audio pre processing, token sequence generation using beam search orchestration in ONNX, as well as token decoding](https://miro.medium.com/v2/resize:fit:700/1*Iw2vgi8ArZ7O3sSsvWUSBg.png)

To generate the model using Olive and ONNX Runtime, run the following in your [Olive whisper example](https://github.com/microsoft/Olive/tree/main/examples/whisper) folder:

python prepare\_whisper\_configs.py --model\_name openai/whisper-tiny.en  
python -m olive.workflows.run --config whisper\_cpu\_int8.json --setup  
python -m olive.workflows.run --config whisper\_cpu\_int8.json

And here is a snippet showing you how to run the model with ONNX Runtime:

import numpy as np  
import onnxruntime  
from onnxruntime\_extensions import get\_library\_path

audio\_file = "audio.mp3"  
model = "whisper-tiny-en-all-int8.onnx"  
with open(audio\_file, "rb") as f:  
    audio = np.asarray(list(f.read()), dtype=np.uint8)

inputs = {  
    "audio\_stream": np.array(\[audio\]),  
    "max\_length": np.array(\[30\], dtype=np.int32),  
    "min\_length": np.array(\[1\], dtype=np.int32),  
    "num\_beams": np.array(\[5\], dtype=np.int32),  
    "num\_return\_sequences": np.array(\[1\], dtype=np.int32),  
    "length\_penalty": np.array(\[1.0\], dtype=np.float32),  
    "repetition\_penalty": np.array(\[1.0\], dtype=np.float32),  
    "attention\_mask": np.zeros((1, 80, 3000), dtype=np.int32),  
}

options = onnxruntime.SessionOptions()  
options.register\_custom\_ops\_library(get\_library\_path())  
session = onnxruntime.InferenceSession(model, options, providers=\["CPUExecutionProvider"\])  
outputs = session.run(None, inputs)\[0\]

The following chart shows a latency comparison between the configurations described so far, with the quantized Whisper Large model, running with ONNX Runtime giving a 70% latency reduction for a single batch and a configured beam size of 5.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*DJH8_6GS06-N32tkVhdTOw.png)

All of which is to say you now have a very fast and a very portable model.

## Which model size to use?

The table below shows the Whisper model size variants, their number of parameters, the all-in-one ONNX model file size, as well as the quoted average accuracy for English speech recognition, in the form of word error rate (WER).

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*tt8bri_OukfO9F_s-yCs_A.png)

In practice, the accuracy is very much dependent on the speaker’s accent and the level of background noise. For example, in this audio sample of a quote from John Doerr’s Measure what Matters, with a distracting amount of background noise, Whisper Tiny produces the following transcription:

## Get Nat Kershaw’s stories in your inbox

Join Medium for free to get updates from this writer.

Remember me for faster sign in

_“Azzary Perenary Action Orient The way an action is, the way a person on the system can be attempts to will a quick striving. In my view, the key to satisfaction is to set the person calls, which no more is to come, or to reflect on each human, then the key to the cycle.”_

And Whisper Large:

_“Both AI’s are inherently action oriented, but when action is relentless and unceasing, it can be a hamster wheel of grim striving. In my view, the key to satisfaction is to set aggressive goals, achieve most of them, pause to reflect on the achievement, and then repeat the cycle.”_

Neither are 100% correct but Whisper Large is very close. This is the actual text:

_“OKRs are inherently action oriented. But when action is relentless and unceasing, it can be a hamster wheel of grim striving. In my view, the key to satisfaction is to set aggressive goals, achieve most of them, pause to reflect on the achievement, and then repeat the cycle.”_

Which model size you choose will depend on the resources available. For smaller platforms such as web and mobile, Whisper Tiny may be the only model that fits the target constraints.

## Deploy on mobile

You can run Whisper on mobile using the all-in-one Whisper Tiny model, produced by Olive.

Olive can generate the model with and without audio decoding, as some platforms provide comprehensive audio decoding out of the box, and some do not. For the application shown here, audio decoding is provided by the platform and not the model.

python prepare\_whisper\_configs.py --model\_name openai/whisper-tiny.en --no\_audio\_decoder  
python -m olive.workflows.run --config whisper\_cpu\_int8.json --setup  
python -m olive.workflows.run --config whisper\_cpu\_int8.json

This is an example app, with Kotlin inference code in for the app shown in the snippet.

![](https://miro.medium.com/v2/resize:fit:351/1*BwIfIETNglt-L9q_q2XAyg.png)

fun run(audioTensor: OnnxTensor): Result {  
    val inputs = mutableMapOf<String, OnnxTensor>()  
    baseInputs.toMap(inputs)  
    inputs\["audio\_pcm"\] = audioTensor  
    val startTimeInMs = SystemClock.elapsedRealtime()  
    val outputs = session.run(inputs)  
    val elapsedTimeInMs = SystemClock.elapsedRealtime() - startTimeInMs  
    val recognizedText = outputs.use {  
       @Suppress("UNCHECKED\_CAST")  
       (outputs\[0\].value as Array<Array<String>>)\[0\]\[0\]  
    }  
    return Result(recognizedText, elapsedTimeInMs)  
}

## Deploy on web

You can also deploy Whisper in the browser. This demo web application allows you to input or record a speech sample and displays the resulting transcription. Like with mobile, the Whisper model used in this application does not include audio decoding.

![](https://miro.medium.com/v2/resize:fit:413/1*P84OEF_TAQf6IyK71SAX4w.png)

Here is a snippet of the Javascript inference code:

async run(audio\_pcm, beams = 1) {  
      
    const feed = {  
        "audio\_pcm": audio\_pcm,  
        "max\_length": new ort.Tensor(new Int32Array(this.max\_length), \[1\]),  
        "min\_length": new ort.Tensor(new Int32Array(this.min\_length), \[1\]),  
        "num\_beams": new ort.Tensor(Int32Array.from({ length: 1 }, () => beams), \[1\]),  
        "num\_return\_sequences": new ort.Tensor(new Int32Array(this.num\_return\_sequences), \[1\]),  
        "length\_penalty": new ort.Tensor(new Float32Array(this.length\_penalty), \[1\]),  
        "repetition\_penalty": new ort.Tensor(new Float32Array(this.repetition\_penalty), \[1\]),  
        "attention\_mask": new ort.Tensor(new Int32Array(this.attention\_mask), \[1, 80, 3000\]),  
    }  
    return this.sess.run(feed);  
}

The web application prints out the time it takes to perform the transcription (that is, the end-to-end inference latency) relative to the length of the audio sample. You can see for the above sample, the application takes 5.5 seconds for 23.2 seconds of audio, a ratio of 5.7 x real-time.

## Hybrid deployment with the ONNX Runtime Azure EP

But wait there’s more. In some scenarios the choice of model cannot be made up front. The background noise of a particular user may prevent Whisper Tiny from transcribing their speech accurately, or some other quality or performance metric may constrain your options locally. ONNX Runtime provides a local to cloud solution to solve these scenarios. The hybrid functionality is provided by the [Azure Execution Provider](https://onnxruntime.ai/docs/execution-providers/Azure-ExecutionProvider.html). With the Azure EP, you can use the exact same API to run models locally or in the cloud.

You can see this in action in this [Windows audio transcription demo application](https://github.com/onnxruntime/Whisper-HybridLoop-Onnx-Demo):

  public SessionOptions GetSessionOptionsForEp()  
  {  
     var sessionOptions = new SessionOptions();  
     switch (ExecutionProviderTarget)  
     {  
        case ExecutionProvider.DirectML:  
            sessionOptions.GraphOptimizationLevel = GraphOptimizationLevel.ORT\_ENABLE\_ALL;  
            sessionOptions.EnableMemoryPattern = false;  
            sessionOptions.AppendExecutionProvider\_DML(DeviceId);  
            sessionOptions.AppendExecutionProvider\_CPU();  
            return sessionOptions;  
        case ExecutionProvider.Azure:  
            sessionOptions.AddSessionConfigEntry("azure.endpoint\_type", "openai");  
            sessionOptions.AddSessionConfigEntry("azure.uri", "https://api.openai.com/v1/audio/translations");  
            sessionOptions.AddSessionConfigEntry("azure.model\_name", "whisper-1");  
            sessionOptions.AppendExecutionProvider("AZURE");  
            return sessionOptions;  
        default:  
        case ExecutionProvider.Cpu:  
            sessionOptions.AppendExecutionProvider\_CPU();  
            return sessionOptions;  
        }  
    }

  var sessionOptions = config.GetSessionOptionsForEp();  
  sessionOptions.RegisterOrtExtensions();

  var session = new InferenceSession(config.WhisperOnnxPath, sessionOptions);

  List<string\> outputs = new List<string\>() { "str" };  
  var result = session.Run(input, outputs, run\_options);

## What’s next?

Now that you have seen the ease with which you can deploy Whisper on the target of your choice and achieve great performance, try out these samples yourself. And please reach out to the [ONNX Runtime team](https://onnxruntime.ai/) if you have any comments or questions.

[PyTorch, HuggingFace and ONNX Runtime code snippets](https://github.com/natke/whisper)  
[ONNX Runtime Mobile Whisper Android app](https://github.com/microsoft/onnxruntime-inference-examples/tree/main/mobile/examples/speech_recognition)  
[ONNX Runtime Web Whisper app](https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/ort-whisper)  
[Whisper ONNX Runtime benchmarking scripts](https://github.com/kunal-vaishnavi/whisper/blob/ort/scripts/benchmark.sh)

These results and applications were built with [ONNX Runtime 1.15.0](https://github.com/microsoft/onnxruntime/releases/tag/v1.15.0) and [Olive 0.2.0](https://github.com/microsoft/Olive/releases/tag/v0.2.0). We expect even better things with upcoming releases!

_This blog post was co-authored by_ [_Kunal Vaishnavi,_](https://kunalvaishnavi.medium.com/) _Software Engineer in the AI Frameworks team at Microsoft. Kunal also wrote the benchmarking scripts and gathered the performance data._