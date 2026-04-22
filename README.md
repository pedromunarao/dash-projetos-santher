# Priority Manager

**Priority Manager** é uma aplicação web moderna para o gerenciamento de projetos e tarefas da equipe de TI da Santher. O sistema oferece um painel interativo no formato Kanban, visões customizadas para TV (Dashboards) e um módulo de configuração dinâmico, tudo construído com um design premium e responsivo (Glassmorphism).

## 🚀 Funcionalidades

*   **Quadro Kanban Dinâmico:** Gerenciamento visual de tarefas com sistema de "arrastar e soltar" (drag-and-drop).
*   **Gestão de Tarefas e Recursos:** Criação, edição, exclusão e atribuição de tarefas a diferentes recursos.
*   **Módulo de Cadastros (Configurações):** Interface unificada para gerenciar as colunas do Kanban (Status), Áreas Solicitantes e outros parâmetros do sistema, de forma dinâmica e integrada ao banco de dados.
*   **Dashboard para TV:** Visualizações otimizadas (modo apresentação) para acompanhamento de métricas e status das atividades em tempo real, com gráficos interativos (Chart.js).
*   **Design Premium:** Interface moderna utilizando princípios de "Glassmorphism", com animações fluidas e responsividade.
*   **Banco de Dados Embutido:** Persistência de dados utilizando SQLite em memória/arquivo (via `sql.js`).

## 🛠️ Tecnologias Utilizadas

*   **Backend:** Node.js, Express.js
*   **Banco de Dados:** SQLite (`sql.js`)
*   **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (Módulos ES6)
*   **Gráficos:** Chart.js
*   **Infraestrutura:** Nginx (Reverse Proxy), PM2 (Gerenciamento de Processos)

## 📁 Estrutura do Projeto

O projeto adota uma arquitetura modular para facilitar a manutenção e escalabilidade:

```text
/
├── css/                  # Estilos organizados por domínio (base, layout, components, pages)
├── js/                   # Scripts frontend organizados em módulos e utilitários
│   ├── modules/          # Funcionalidades específicas (kanban, cadastros, tv, etc.)
│   ├── utils/            # Funções utilitárias compartilhadas
│   └── app.js            # Ponto de entrada do frontend
├── database/             # Arquivos relacionados ao banco de dados SQLite
├── assets/               # Imagens, ícones e outros arquivos estáticos
├── index.html            # Estrutura principal da aplicação web
├── server.js             # Servidor backend Express e API RESTful
├── ecosystem.config.js   # Configuração do PM2 para ambiente de produção
├── nginx.conf            # Exemplo de configuração de proxy reverso Nginx
└── package.json          # Dependências e scripts do projeto
```

## ⚙️ Como Executar o Projeto Localmente

### Pré-requisitos
*   Node.js instalado (versão 14+ recomendada).

### Instalação

1.  Clone o repositório ou baixe os arquivos do projeto.
2.  Abra o terminal na pasta raiz do projeto.
3.  Instale as dependências executando o comando:
    ```bash
    npm install
    ```

### Executando em Desenvolvimento

Para rodar a aplicação em modo de desenvolvimento, utilize o comando:

```bash
npm run dev
```
*(Ou `npm start`)*

O servidor iniciará localmente e a aplicação estará disponível no navegador, geralmente em `http://localhost:3000` (ou a porta configurada).

## 🌐 Implantação (Produção)

O projeto está configurado para ser executado em um ambiente de produção utilizando **PM2** e **Nginx**.

1.  **PM2 (Process Manager):** Utilize o arquivo `ecosystem.config.js` para iniciar a aplicação em background e garantir que ela reinicie automaticamente em caso de falhas.
    ```bash
    pm2 start ecosystem.config.js
    ```
2.  **Nginx (Proxy Reverso):** O arquivo `nginx.conf` contém a configuração base para expor a aplicação rodando na porta local para as portas HTTP/HTTPS externas (80/443).
