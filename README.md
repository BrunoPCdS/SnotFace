# Snot Face

Aplicação web para estimar a idade aparente em uma foto e gerar um meme em estilo cartoon. O usuário entra com Google, captura uma foto pela webcam ou envia uma imagem, e pode baixar o resultado e gerenciar seu histórico.


# Tela inicial
<div>
    <img src="./imagens/foto 1.jpg" alt="index da pagina" width="260">
</div>

# captura para registrar a foto

<div>
    <img src="./imagens/foto 2.jpg" alt="index da pagina" width="260">
</div>

# área de histórico de memes

<div>
    <img src="./imagens/foto 3.jpg" alt="index da pagina" width="260">
</div>

# o resultado pode mudar conforme o prompt
<div>
    <img src="./imagens/Screenshot_3.png" alt="index da pagina" width="260">
</div>

## Como funciona

1. A estimativa de idade roda localmente no navegador, usando TensorFlow.js e os modelos de detecção de rosto e idade incluídos no frontend. A inferência de idade não chama Hugging Face e não consome créditos de API.
2. O backend Node.js envia a imagem ao Replicate (`black-forest-labs/flux-kontext-pro`) para criar a versão cartoon.
3. A foto original e o resultado são armazenados no PostgreSQL por até 30 dias.

A idade é apenas uma estimativa visual e pode estar incorreta. A foto é enviada ao backend e ao Replicate para gerar o meme. Os modelos locais são baseados no [@vladmandic/face-api](https://github.com/vladmandic/face-api), que fornece detecção facial e estimativa de idade no navegador.

## Requisitos

- Node.js 20 ou superior e npm
- PostgreSQL acessível
- Credencial OAuth 2.0 do Google
- Token da API do Replicate

## Configuração

### Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Configure `backend/.env`:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/banco?sslmode=require"
PORT="3001"
FRONTEND_URL="http://localhost:5173"
REPLICATE_API_TOKEN="seu-token-replicate"
```

Gere o cliente Prisma e aplique as migrações:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

### Frontend

Crie `frontend/.env` com:

```env
VITE_API_URL="http://localhost:3001"
VITE_GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
```

No Google Cloud Console, adicione `http://localhost:5173` às origens JavaScript autorizadas do cliente OAuth. Depois instale as dependências:

```powershell
cd ../frontend
npm install
```

Os arquivos de modelo para estimativa de idade ficam em `frontend/public/models` e são servidos pelo próprio frontend. A inferência roda no navegador do usuário. Na primeira execução, o navegador baixa esses arquivos do servidor local da aplicação.

## Executar

Em dois terminais, a partir da raiz do projeto:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Abra `http://localhost:5173` no navegador. A geração de memes ainda usa a API Replicate e requer um token válido.

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Estado do backend |
| `POST` | `/api/auth/google` | Registra ou atualiza o usuário autenticado pelo Google |
| `POST` | `/api/analyze` | Recebe a idade estimada localmente e gera/salva o meme |
| `GET` | `/api/scans?userId=1` | Lista o histórico do usuário |
| `GET` | `/api/scans/:id/image` | Obtém a imagem original |
| `GET` | `/api/scans/:id/meme` | Obtém o meme gerado |
| `DELETE` | `/api/scans/:id?userId=1` | Exclui um item do histórico |
| `DELETE` | `/api/scans?userId=1` | Limpa o histórico do usuário |

## Segurança

Mantenha o token Replicate, credenciais OAuth e a URL do banco em arquivos `.env` locais. Não coloque segredos no frontend nem os envie para o controle de versão. A chave Replicate compartilhada anteriormente deve ser revogada e substituída por uma nova.
