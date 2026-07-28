# Controle Total Android

Sistema de **controle remoto de dispositivos Android** via navegador. Permite enviar toques, swipes, texto, abrir apps e ver a tela do celular em tempo real — sem root.

---

## Arquitetura

```
[Navegador Web] ←→ [Backend Node.js] ←→ [App Android (Agent)]
   localhost:3000      localhost:3001       WebSocket :3002
   (Next.js + React)   (Fastify + Socket.IO)   (OkHttp raw WS)
                              ↕
                        ADB screencap
                      (captura de tela)
```

### Componentes

| Camada | Tecnologias | Função |
|--------|-------------|--------|
| **Web Panel** | Next.js 16, React 19, Tailwind 4, Socket.IO Client | Interface de controle no navegador |
| **Backend** | Fastify 5, Socket.IO 4, ws, Prisma, PostgreSQL (futuro) | Roteamento de comandos, bridge WebSocket, captura de tela via ADB |
| **Android Agent** | Kotlin, OkHttp, Hilt/Dagger, AccessibilityService | Conexão WebSocket, injeção de gestos, execução de comandos |

---

## Funcionalidades

### Controle por Mouse na Tela
- **Clique** na prévia da tela → envia `TAP` nas coordenadas exatas
- **Arraste** sobre a tela → envia `SWIPE` com coordenadas origem/destino
- **Scroll do mouse** sobre a tela → envia `SCROLL up/down`
- **Crosshair** mostra posição do mouse em tempo real
- **Ripple animation** ao tocar

### Botões de Controle
- **Navegação**: Voltar, Home, Recentes
- **Toque Rápido**: Topo, Centro, Base, Esquerda, Direita
- **Digitar Texto**: envia texto para o campo focado no celular
- **Abrir App**: atalhos para Keep, WhatsApp, Instagram, YouTube, Config, Chrome
- **Ações**: Print, Bloquear, Volume +/-, Scroll ↑/↓

### Captura de Tela
- Polling contínuo via ADB `screencap -p`
- Cache do último frame no backend (resposta instantânea)
- Taxa de ~2-3 quadros por segundo
- Resolução configurável na interface

### Comandos

| Comando | Payload | Descrição |
|---------|---------|----------|
| `PRESS_BACK` | — | Botão Voltar |
| `PRESS_HOME` | — | Botão Home |
| `PRESS_RECENTS` | — | Botão Recentes |
| `PRESS_POWER` | — | Bloquear tela |
| `TAP` | `{ x, y }` | Toque em coordenada |
| `SWIPE` | `{ x1, y1, x2, y2 }` ou `{ direction }` | Swipe livre ou direcional |
| `SCROLL` | `{ direction: "up" \| "down" }` | Scroll |
| `TYPE_TEXT` | `{ text }` | Digitar texto |
| `OPEN_APP` | `{ package }` | Abrir app por package name |
| `VOLUME_UP` | — | Aumentar volume |
| `VOLUME_DOWN` | — | Diminuir volume |

---

## Tecnologias e Ferramentas

### Backend (`backend-server/`)
- **Fastify 5** — Servidor HTTP rápido e leve
- **Socket.IO 4** — WebSocket para comunicação com o painel web
- **ws** — WebSocket raw para bridge com o Android (OkHttp)
- **Prisma** — ORM para PostgreSQL (futuro)
- **@fastify/cors** — CORS para requisições cross-origin
- **dotenv** — Configuração de ambiente
- **zod** — Validação de schemas
- **jsonwebtoken + bcrypt** — Autenticação (futuro)
- **TypeScript** — Tipagem estática
- **nodemon** — Hot reload em desenvolvimento

### Web Panel (`web-panel/`)
- **Next.js 16** — Framework React com SSR/SSG
- **React 19** — UI componentizada
- **Tailwind CSS 4** — Estilização utility-first
- **socket.io-client** — Conexão WebSocket com o backend
- **TypeScript** — Tipagem estática
- **ESLint** — Linting

### Android Agent (`android-agent/`)
- **Kotlin** — Linguagem principal
- **OkHttp 4** — Cliente WebSocket raw
- **Hilt/Dagger 2.50** — Injeção de dependência
- **AccessibilityService** — Injeção de gestos sem root (tap, swipe, scroll, texto, back, home, recents)
- **Foreground Service** — Conexão persistente em background
- **Boot Receiver** — Auto-inicialização após reboot
- **Gson** — Serialização JSON
- **Coroutines** — Operações assíncronas
- **WorkManager** — Background persistence
- **Gradle 8.14.3** — Build system
- **compileSdk 36 / minSdk 26** — Android API levels

### Infraestrutura
- **Docker** — PostgreSQL 15 + Redis 7 (produção futura)
- **ADB** — Captura de tela via `screencap -p`
- **Android Studio** — Desenvolvimento e build do app Android

---

## Setup e Execução

### 1. Pré-requisitos
- Node.js 18+
- Android Studio (para build do app)
- Java JDK 17
- ADB (Android SDK Platform Tools)
- Celular com Depuração USB ativada

### 2. Configurar IP do Servidor

Edite `android-agent/app/src/main/java/com/remotecontrol/agent/service/AgentService.kt`:

```kotlin
const val SERVER_URL = "ws://SEU_IP_AQUI:3002"
```

Descubra seu IP local:
```powershell
ipconfig
```

### 3. Iniciar Backend

```powershell
cd backend-server
npm install
npm run dev
```

Servidor em `http://localhost:3001` (Socket.IO) e `ws://localhost:3002` (raw WebSocket bridge).

### 4. Iniciar Web Panel

```powershell
cd web-panel
npm install
npm run dev
```

Painel em `http://localhost:3000`.

### 5. Compilar e Instalar App Android

**Via Android Studio:**
1. File → Open → selecione `android-agent/`
2. Conecte o celular via USB
3. Run ▶

**Via Gradle + ADB:**
```powershell
cd android-agent
gradlew.bat assembleDebug
adb install -t -r app\build\intermediates\apk\debug\app-debug.apk
```

### 6. Configurar Acessibilidade

No celular: **Configurações → Acessibilidade → Remote Control Agent → Ativar**

> ⚠️ Sem a Acessibilidade ativa, os comandos de toque, swipe e texto não funcionam.

### 7. Usar

1. Abra o app no celular (deve mostrar "Conectado")
2. Acesse `http://localhost:3000` no navegador
3. O dispositivo aparece na barra lateral
4. Clique em **Capturar Tela** para ver o display
5. Use os botões ou clique/arraste na tela para controlar

---

## Estrutura do Projeto

```
Script Controle Total Andoid/
├── docker-compose.yml                    # PostgreSQL + Redis (produção)
├── GUIA_DE_TESTE.md                      # Guia de teste rápido
│
├── backend-server/
│   ├── src/index.ts                      # Servidor Fastify + Socket.IO + raw WS bridge
│   ├── prisma/schema.prisma              # Modelos User e Device
│   ├── .env                              # Config (JWT_SECRET, DATABASE_URL, PORT)
│   ├── nodemon.json                      # Hot reload config
│   └── package.json
│
├── web-panel/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                # Root layout com SocketProvider
│   │   │   ├── page.tsx                  # Página principal (sidebar + painel)
│   │   │   └── globals.css               # Design system dark mode
│   │   ├── components/
│   │   │   ├── DeviceSidebar.tsx          # Lista de dispositivos conectados
│   │   │   └── ControlPanel.tsx           # Painel de controle com tela interativa
│   │   └── context/
│   │       └── SocketContext.tsx          # Gerenciamento de estado WebSocket
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
└── android-agent/
    ├── build.gradle                      # Project-level
    ├── settings.gradle
    ├── gradle.properties
    ├── gradlew.bat                       # Gradle wrapper
    └── app/
        ├── build.gradle                  # Module-level (dependencies)
        └── src/main/
            ├── AndroidManifest.xml       # Permissões, serviços, receivers
            ├── res/
            │   ├── values/strings.xml
            │   └── xml/accessibility_service_config.xml
            └── java/com/remotecontrol/agent/
                ├── RemoteControlApp.kt           # Application class (Hilt)
                ├── ui/MainActivity.kt            # Tela de status + permissões
                ├── service/AgentService.kt       # Foreground service + WebSocket + command router
                ├── accessibility/
                │   └── RemoteAccessibilityService.kt  # Gesture injection (tap, swipe, text)
                └── receiver/
                    └── BootReceiver.kt           # Auto-start no boot
```

---

## Fluxo de Dados

```
Painel Web                          Backend                         Android Agent
   │                                   │                                   │
   │── send_command ──────────────────>│                                   │
   │    {deviceId, command, payload}   │                                   │
   │                                   │── execute_command ──────────────>│
   │                                   │    {command, payload}            │
   │                                   │                                   │── executa ação
   │                                   │                                   │   (tap/swipe/text/etc)
   │                                   │<── command_result ───────────────│
   │<── command_result ───────────────│    {event, command, result}       │
   │                                   │                                   │
   │── (poll) /api/screenshot ────────>│                                   │
   │<── { frame: base64 } ────────────│                                   │
   │                                   │── (adb exec-out screencap -p)   │
```

---

## Próximos Passos (Fase 2)

- [ ] Captura de tela via MediaProjection API (sem ADB)
- [ ] Stream de tela em tempo real (~15 fps)
- [ ] Autenticação (JWT + bcrypt)
- [ ] Banco de dados PostgreSQL via Prisma
- [ ] Cache Redis para device registry
- [ ] Múltiplos dispositivos simultâneos
- [ ] Modo lote (enviar comandos para N dispositivos)
- [ ] Histórico de comandos persistente
- [ ] Teclas de atalho no teclado
- [ ] Modo escuro/claro
