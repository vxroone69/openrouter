23/02:

db design :

users (store every signup)
apiKeys (each user can have multiple api keys)
credits (each user can have multiple credits)
onramp transactions 


models (store all models)-[model name, companyId]
providers (store all providers) [provider name, provider website]
companies (store all companies) [company name, company website]
model_provider_mapping (store all model provider mappings) [modelId, providerId, inputTokenCost, outputTokenCost]

conversation (store every conversation user has with the model) [conversationId, userId, input, output, inputTokenCount, outputTokenCount, model_provider_mappingId]
