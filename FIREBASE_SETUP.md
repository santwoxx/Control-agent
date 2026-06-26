# ⚙️ Configuração Firebase — Google Login + Regras de Segurança

## Passo 1 — Ativar o método de login Google

1. Acesse: https://console.firebase.google.com/project/control-agent-369cb/authentication/providers
2. Clique em **Google**
3. Ative o toggle **Habilitar**
4. Coloque um **e-mail de suporte**: `natands.dev@gmail.com`
5. Clique em **Salvar**

---

## Passo 2 — Configurar regras do Firestore (segurança máxima)

1. Acesse: https://console.firebase.google.com/project/control-agent-369cb/firestore/rules
2. Substitua as regras por:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── Função: verifica se é admin/dono ─────────────────────────────
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == "natands.dev@gmail.com" ||
        request.auth.token.email == "brisasofc@gmail.com"
      );
    }

    // ─── Admins têm acesso total a TUDO ───────────────────────────────
    match /{document=**} {
      allow read, write: if isAdmin();
    }

    // ─── Usuários comuns acessam apenas seus próprios dados ───────────
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId
                         && !isAdmin();
    }
  }
}
```

3. Clique em **Publicar**

---

## Passo 3 — Autorizar domínio localhost (para desenvolvimento)

1. Ainda em Authentication, vá em **Settings → Authorized domains**
2. Verifique se `localhost` está na lista (geralmente já vem)
3. Quando publicar em produção, adicione o domínio do servidor

---

## Resumo do modelo de permissões

| Usuário | Acesso |
|---------|--------|
| `natands.dev@gmail.com` | 👑 Dono — acesso total ao sistema e Firestore |
| `brisasofc@gmail.com`   | 👑 Dono — acesso total ao sistema e Firestore |
| Outros usuários Google  | Acesso apenas aos próprios dados (`/users/{uid}/...`) |

---

## Sobre o APK vs. Firebase

**O APK (Android Agent) NÃO precisa do Firebase.**

```
[APK instalado no celular]
        |
        | WebSocket direto
        |
[Backend Node.js] ←─────→ [Painel Web] ←─── Firebase Auth (só aqui)
```

- O APK se conecta ao backend via WebSocket (IP ou domínio)
- O Firebase protege **apenas o painel web** (login/senha não necessários)
- Para vender: cliente recebe APK + link do painel — faz login com Google — pronto!

---

## Modelo de Venda (Licença Única)

```
Você → Envia APK + Link do painel → Cliente instala APK → Faz login Google → Usa o sistema
```

Para controlar acesso pago:
- Adicione o email do cliente na lista `ADMIN_EMAILS` em `AuthContext.tsx`
- Ou crie um sistema de whitelist no Firestore (próximo passo, se quiser)
