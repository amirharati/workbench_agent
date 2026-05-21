[

![Shawn Chen](https://miro.medium.com/v2/resize:fill:32:32/0*BLxFN0iPf4uLVpXE.)



](https://medium.com/@shawnchen_17577?source=post_page---byline--2c3a25eb9f2a---------------------------------------)

4 min read

Jan 16, 2024

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*M2s_p_qZIStvsVRkpeINVw.png)

Image by DALL-E

Managing hardware resources is a crucial issue when deploying language models on the server side. One common challenge is how to achieve the required system functionality within **limited computing power and memory**. Therefore, when designing the Retrieval-Augmented Generation (RAG) process, we can consider blending small and large language models to achieve various goals.

We will use two small language models: **roberta-large-mnli** and **all-mpnet-base-v2**, each with different tasks. The former is used for zero-shot classification before RAG to guess the type of task the user wants based on the input sentence, while the latter embeds the PDF text serving as the database into a Vector Store. As for text-generating responses, we will use the LLM: **Llama-2–13B-chat-GPTQ**, which can be deployed on Nvidia RTX 3090 or RTX 4090.

### Small Language Model for Routing

Zero-shot classification is a technique used by AI models to predict the correct category for a set of texts they’ve never encountered before. In this example, we will apply this technique to recognize unfamiliar user tasks before generating responses using RAG.

RoBERTa models, especially the larger ones, are known for their high accuracy in NLP tasks. Seeking the best classification accuracy, I chose **roberta-large-mnli** over **facebook/bart-large-mnli**. This decision was based on RoBERTa’s strong performance in NLP.

![](https://miro.medium.com/v2/resize:fit:594/1*vZH4uGt69eGFM0jt9NHv5g.png)

\[1\]

When a user’s task is input, it will be categorized into three types: “**LinuxCommand**” — commands related to the system, “**TechnicalSupport**” — data retrieval and Q&A for customer support engineers, and “**GeneralResponse**” — questions that cannot be classified, which are determined and output by LLM itself. The classification output decides which chain to use later in the pipeline.

Sample Code:

CLASSIFIER\_MODEL\_NAME = "roberta-large-mnli"  
classifier\_model = pipeline("zero-shot-classification",  
                      model=CLASSIFIER\_MODEL\_NAME)

def classify\_sequence(input\_data):  
    sequence\_to\_classify = input\_data\["question"\]  
    candidate\_labels = \['LinuxCommand', 'TechnicalSupport', 'GeneralResponse'\]  
    classification = classifier\_model(sequence\_to\_classify, candidate\_labels)  
    # Extract the label with the highest score  
    return {"topic": classification\['labels'\]\[0\], "question": sequence\_to\_classify}

classifier\_runnable = RunnableLambda(classify\_sequence)

### Small Language Model for Embedding in RAG

Selecting “**all-mpnet-base-v2**” as the embedding model offers a well-rounded approach, balancing speed with high-quality performance. This model is highlighted in the Massive Text Embedding Benchmark (MTEB) for its ability to provide superior embeddings efficiently.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*hIDU7aj5bZ1DGoCUfCqqBw.png)

_Models by average English MTEB score (y) vs speed (x) vs embedding size (circle size). \[2\]_

Sample Code:

pdfs = glob.glob(f"{pdf\_path}/\*.pdf")

all\_pages = \[\]  
for pdf\_file in pdfs:  
  loader = PyPDFLoader(pdf\_file)  
  pages = loader.load()  
  all\_pages.extend(pages)

text\_splitter = RecursiveCharacterTextSplitter(  
            chunk\_size=128,  
            chunk\_overlap=24)  
documents = \[Document(page\_content=page) for page in all\_pages\]  
split\_documents = text\_splitter.split\_documents(documents)  
texts = \[doc.page\_content for doc in split\_documents\]

model\_path="sentence-transformers/all-mpnet-base-v2"

embeddings = HuggingFaceEmbeddings(  
            model\_name=model\_path,  
            model\_kwargs={"device": "cuda:0"},  
            encode\_kwargs={"normalize\_embeddings": True},  
        )  
documents = \[Document(page\_content=text) for text in texts\]  
db = Qdrant.from\_documents(documents, embeddings, location=":memory:", collection\_name="pdfs")

### Large Language Model for Text Generation

We are using **Llama-2–13B-chat-GPTQ** here because it helps save memory while using a single GPU in a local environment. This model is chosen to ensure that we can maintain fast inference speeds.

## Get Shawn Chen’s stories in your inbox

Join Medium for free to get updates from this writer.

Remember me for faster sign in

Sample Code:

    # Check if CUDA is available  
    if not torch.cuda.is\_available():  
      raise EnvironmentError("CUDA not available.")

                # Initialize tokenizer  
    self.tokenizer = AutoTokenizer.from\_pretrained(self.model\_name)

    # Set up model configuration  
    config = AutoConfig.from\_pretrained(self.model\_name)

    config.quantization\_config\["use\_exllama"\] = True  
    config.quantization\_config\["exllama\_config"\] = {"version": 2}

                # Load model with configuration and precision  
    self.model = AutoModelForCausalLM.from\_pretrained(  
      self.model\_name,   
      config=config,   
      device\_map="cuda:0",  # Set to GPU 0  
      torch\_dtype=torch\_dtype  
    )

### The Full Chain

The chain configures an **Llama-2–13B-chat-GPTQ** for text generation and creates three specific chains: a Command Chain for Linux system commands, a Support Chain for technical support queries, and a General Chain for a wide range of other queries. The function also includes a classification system to route the queries to the appropriate chain based on their topic, with the previously mentioned model: **roberta-large-mnli**. This setup allows the AI to respond accurately to different types of user requests by using the relevant chain. The Support Chain is designed as a RetrievalQA chain, which is a type of retrieval-augmented generation. It functions by first retrieving relevant documents based on the user’s query and then using this information to generate an appropriate response.

Sample Code:

  # LinuxCommand  
  command\_template = """  
  \[INST\] <<SYS>>  
  <YOUR PROMPT>  
  question:  
  {question}  
  answer:  
  \[/INST\]"""  
  command\_chain =  (PromptTemplate(template=command\_template,input\_variables=\["question"\]) | llm | output\_runnable )

  # TechnicalSupport  
  support\_template = """  
  \[INST\] <<SYS>>  
  <YOUR PROMPT>  
  <</SYS>>  
  {context}  
  {question}  
  answer:  
  \[/INST\]  
  """

  # GeneralResponse  
  general\_template = """  
  \[INST\] <<SYS>>  
  <YOUR PROMPT>  
  <</SYS>>  
  question:  
  {question}  
  answer:  
  \[/INST\]"""  
  general\_chain = (PromptTemplate(template=general\_template,input\_variables=\["question"\]) | llm | output\_runnable)

  support\_prompt = PromptTemplate(template=support\_template, input\_variables=\["context","question"\])

  support\_chain = RetrievalQA.from\_chain\_type(  
      llm=llm,  
      chain\_type="stuff",  
      retriever=db.as\_retriever(),  
      input\_key="question",  
      return\_source\_documents=True,  
      chain\_type\_kwargs={"prompt": support\_prompt},  
      verbose=False  
  )  
  logger.info("support chain loaded successfully.")

  def route\_classification(output):  
    if output\['topic'\] == 'LinuxCommand':  
        logger.info("Routing to command chain")  
        return command\_chain  
    elif output\['topic'\] == 'TechnicalSupport':  
        logger.info("Routing to support chain")  
        return support\_chain  
    else:  
        logger.info("Routing to general chain")  
        return general\_chain

  routing\_runnable = RunnableLambda(route\_classification)

  # Full chain integration  
  full\_chain = classifier\_runnable | routing\_runnable

### Conclusion

By using small models like **roberta-large-mnli** for zero-shot classification and **all-mpnet-base-v2** for embedding, alongside the larger **Llama-2–13B-chat-GPTQ** for text generation, we make our system work well without using too much computer power, effectively blending different model sizes in the RAG process.

### References

\[1\] Kate Pearce1, Tiffany Zhan1, Aneesh Komanduri2, Justin Zhan2, “A Comparative Study of Transformer-Based Language Models on Extractive Question Answering”, 2021

\[2\] MTEB: Massive Text Embedding Benchmark, [https://huggingface.co/blog/mteb](https://huggingface.co/blog/mteb)