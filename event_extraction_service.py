from langchain_ollama import ChatOllama

llm = ChatOllama(
    model       = "deepseek-r1:7b",
    temperature = 0.1   
)
