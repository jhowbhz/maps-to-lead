# 📍 Maps to Lead
É um projeto open source com a iniciativa de gerar prospecção de leads de forma mais automatizada e geral, de maneira nenhuma apoiamos ou incentivamos a prática de SPAM, utilize com sabedoria.

### Demostração online
https://api.mapslead.com

### Dependencias
```bash
sudo apt install -y curl nano git gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget build-essential apt-transport-https libgbm-dev redis nginx python3-certbot-nginx
```

### Para instalar

```bash
apt update && cd /opt
git clone https://github.com/jhowbhz/maps-to-lead.git maps-to-leads
cd /opt/maps-to-leads
cp .env_example .env
npm install
```

### Para rodar o projeto
```npm start```

### Para rodar em background
```npm install pm2 -g ```

```pm2 start index.js --name="API - MAPS TO LEADS"```

### Para utilizar a API
```c
curl --location --request POST 'http://127.0.0.1:9000/find' \
--header 'Content-Type: application/json' \
--data-raw '{
    "time": 20,
    "hook": "additional parameter",
    "query": "Barbearia Cabral, Contagem",
    "webhook": "https://webhook.site/852df82a-4270-4f2b-9278-a5b360381bd7"
}'
``` 

### Resultado 200
```json
{
    "error": false,
    "message": "Sucesso, você receberá os dados em seu webhook em até 5 minutos.",
    "query": "Barbearia Cabral, Contagem",
    "webhook": "https://webhook.site/852df82a-4270-4f2b-9278-a5b360381bd7"
}
```
### Resposta webhook

```json
{
  "hook": "additional parameter",
  "name": "Barbearia Alamedas",
  "rating": "4,7(161)",
  "pic": "https://lh5.googleusercontent.com/p/AF1QipNzyLVvMD7qRTP2VfgfkHT3KsOUAjpWjSkwMfon=w92-h92-k-no",
  "formated": {
    "name": "Barbearia Alamedas",
    "address": "Alameda dos Flamingos, 213 - Cabral, Contagem - MG, 32146-036",
    "phone": "5531988989591",
    "whatsapp": "https:/wa.me/5531988989591"
  },
  "infos": [
    "Alameda dos Flamingos, 213 - Cabral, Contagem - MG, 32146-036",
    "barbeariaalamedas.negocio.site",
    "(31) 98898-9591",
    "Cabral, Contagem - MG",
  ]
}
```

### Usando nginx

```nano /etc/nginx/sites-available/mapslead```

```text
upstream mapslead {
    server 127.0.0.1:3333;
    keepalive 8;
}
server {

    server_name SEU_DOMINIO;

    location / {
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header Host $http_host;
      proxy_set_header X-NginX-Proxy true;
      proxy_pass http://mapslead/;
      proxy_redirect off;
    }
    listen 80;
}
```

```ln -s /etc/nginx/sites-available/mapslead /etc/nginx/sites-enabled/mapslead```

### Adicionando SSL

``` certbot --nginx```
