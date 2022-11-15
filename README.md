# Maps to Lead
É um projeto open source com a iniciativa de gerar prospecção de leads de forma mais automatizada e geral, de maneira nenhuma apoiamos ou incentivamos a pratica de SPAM

### Para instalar
```npm install```
### Para rodar o projeto
```node server.js```

### Para utilizar a API
```c
curl --location --request POST 'http://127.0.0.1:9000/find' \
--header 'Content-Type: application/json' \
--data-raw '{
    "query": "Padaria Sao Paulo, SP",
    "time": 50,
    "webhook": "https://webhook.site/9f034a4e-d51d-489d-91a2-d8fef7cd67cf"
}'
``` 

### Resultado 200
```json
{
    "error": false,
    "message": "Sua pesquisa foi realizada com sucesso, você receberá os dados em seu webhook em até 5 minutos.",
    "query": "Padaria Sao Paulo, SP",
    "webhook": "https://webhook.site/9f034a4e-d51d-489d-91a2-d8fef7cd67cf"
}
```

### Resposta webhook

```json
{
  "name": "Panificadora Santa Tereza",
  "rating": "4,4(5.222)",
  "infos": [
        "Praça Dr. João Mendes, 150 - Centro Histórico de São Paulo, São Paulo - SP, 01501-000",
        "Fazer um pedido",
        "(11) 3111-1030",
        "C9X8+22 Centro Histórico de São Paulo, São Paulo - SP",
        "Enviar para smartphone"
    ]
}
```