## Web Scrapping Energisa

Automação que busca contas na Energisa.

### Iniciando

Primeiro, é necessário instalar as dependências:

```shell
yarn
```
ou
```shell
npm install
```

Após isto vamos configurar as variáveis de ambiente

### Variáveis de ambiente

Dentro do seu projeto, renomei o arquivo ```.env.example``` para ```.env```. Após feito isto preencha as variáveis seguindo a orientação abaixo:

```
ENERGISA_SIGLA_ESTADO=[Sigla do estado em que a unidade consumidora está]
ENERGISA_CIDADE=[A cidade do estado em que a unidade consumidora se encontra]
ENERGISA_CPF=[O CPF que é usado para acessar sua conta]
ENERGISA_SENHA=[Senha usada para acessar sua conta]
ENERGISA_URL=https://www.energisa.com.br ## Host da energisa
ENERGISA_CONTAS_URL=/agenciavirtual/paginas/ sua-fatura ## URL onde se encontram as faturas
SOMENTE_CONTA_NAO_PAGA=true ## Esta variável é quem determina o tipo de conta a serem pegas. Caso seja false, ela pegará todas as contas
```
