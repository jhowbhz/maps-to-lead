# Política de Segurança

Obrigado por ajudar a manter o **maps-to-lead** seguro. Este documento explica
quais versões recebem correções de segurança e como relatar uma vulnerabilidade
de forma responsável.

## Versões suportadas

Correções de segurança são aplicadas apenas na linha estável mais recente.
Recomendamos sempre usar a última versão (ou a imagem `ghcr.io/jhowbhz/maps-to-lead:latest`).

| Versão | Suportada          |
| ------ | ------------------ |
| 2.x    | :white_check_mark: |
| < 2.0  | :x:                |

## Como relatar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança. Prefira um canal privado:

1. **GitHub Security Advisories** (recomendado): acesse a aba
   [**Security → Report a vulnerability**](https://github.com/jhowbhz/maps-to-lead/security/advisories/new)
   do repositório. O relato fica visível apenas para os mantenedores.
2. **E-mail**: como alternativa, envie os detalhes para **contato@apibrasil.com.br**
   com o assunto `[SECURITY] maps-to-lead`.

Inclua o máximo de informação possível para reproduzir e avaliar:

- versão / tag da imagem afetada (ex.: `2.0.0`, `edge`, commit);
- descrição do problema e impacto potencial;
- passos para reproduzir (requests, payloads, configuração);
- se houver, uma prova de conceito e sugestão de correção.

## O que esperar

- **Confirmação de recebimento:** em até **72 horas**.
- **Avaliação inicial** (severidade e se é aceito/recusado): em até **7 dias**.
- **Correção:** vulnerabilidades aceitas são priorizadas conforme a severidade;
  publicamos uma nova versão e um _advisory_ creditando quem reportou (se desejar).
- Se o relato for recusado (ex.: fora de escopo ou comportamento esperado),
  explicamos o motivo.

Pedimos que a falha seja mantida em sigilo até a disponibilização da correção
(divulgação coordenada).

## Escopo

Estão **no escopo**, por exemplo:

- bypass de autenticação do painel `/manager` (`MANAGER_TOKEN`);
- injeção (SQL/command), SSRF via `webhook.url` ou visita a sites de leads,
  path traversal, exposição de dados sensíveis;
- falhas na imagem Docker que permitam escapar do container ou escalar privilégios.

Estão **fora do escopo**:

- uso da ferramenta para SPAM ou coleta abusiva de dados — isso é
  responsabilidade do operador, não uma vulnerabilidade do projeto
  (veja o aviso de uso responsável no [README](README.md));
- vulnerabilidades em dependências de terceiros sem impacto demonstrável aqui
  (reporte ao projeto de origem);
- ataques que exigem acesso físico ou credenciais já comprometidas do host.
