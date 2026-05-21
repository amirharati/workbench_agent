scenario

## Hugging Face + ONNX Runtime

ONNX Runtime can be used to accelerate well over 130,000 of the models available on Hugging Face.

[Recent blog with Hugging Face →](https://cloudblogs.microsoft.com/opensource/2023/10/04/accelerating-over-130000-hugging-face-models-with-onnx-runtime/)

## Supported Models

The top 30 most popular model architectures on Hugging Face are all supported by ONNX Runtime, and over 80 Hugging Face model architectures in total boast ORT support. This list includes [BERT](https://huggingface.co/models?other=bert), [GPT2](https://huggingface.co/models?other=gpt2), [T5](https://huggingface.co/models?other=t5), [Stable Diffusion](https://huggingface.co/models?other=stable-diffusion), [Whisper](https://huggingface.co/models?other=whisper), and many more.

ONNX models can be found directly from the Hugging Face Model Hub in its [ONNX model library](https://huggingface.co/models?library=onnx).

Hugging Face also provides ONNX support for a variety of other models not listed in the ONNX model library. With [Hugging Face Optimum](https://huggingface.co/docs/optimum/exporters/onnx/overview), you can easily convert pretrained models to ONNX, and [Transformers.js](https://huggingface.co/docs/transformers.js/index) lets you run Hugging Face Transformers directly from your browser!

## Large Language Models

ONNX Runtime also supports many increasingly popular large language model (LLM) architectures, including [LLaMA](https://huggingface.co/models?other=llama), [GPT Neo](https://huggingface.co/models?other=gpt_neo), [BLOOM](https://huggingface.co/models?other=bloom), and many more.

Hugging Face also provides an [Open LLM Leaderboard](https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard) with more detailed tracking and evaluation of recently releases LLMs from the community.

## Cloud Models

Models accelerated by ONNX Runtime can be easily deployed to the cloud through Azure Machine Learning, which improves time-to-value, streamlines MLOps, provides built-in AI governance, and designs responsible AI solutions.

[Azure Machine Learning](https://ml.azure.com/) publishes a curated model list that is updated regularly and includes the most popular models. You can run the vast majority of the models on the curated list with ONNX Runtime, using HuggingFace Optimum.

## Transformers.js + ONNX Runtime Web

[Transformers.js](https://huggingface.co/docs/transformers.js/index) is an amazing tool to run transformers on the web, designed to be functionally equivalent to Hugging Face’s [transformers](https://github.com/huggingface/transformers) python library.

Powered by ONNX Runtime Web, it enables you to execute cutting-edge Machine Learning tasks in areas such as Natural Language Processing, Computer Vision, Audio, and Multimodal directly within your web browser, eliminating the need for a server.