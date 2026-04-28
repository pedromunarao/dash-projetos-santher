#!/bin/bash

# ==============================================================================
# Script para iniciar o servidor Priority Manager na Máquina Virtual (VM)
# ==============================================================================

echo "==========================================="
echo "  Iniciando o Priority Manager na VM...    "
echo "==========================================="

APP_DIR="/opt/priority-manager"
APP_USER="dashapp"
LOG_DIR="/var/log/pm2"

# ------------------------------------------------------------------------------
# 1. Criar usuário dedicado sem shell interativo (segurança)
# ------------------------------------------------------------------------------
if id "$APP_USER" &>/dev/null; then
  echo "[+] Usuário '$APP_USER' já existe."
else
  echo "[+] Criando usuário dedicado '$APP_USER' (sem shell interativo)..."
  sudo useradd -r -s /bin/false "$APP_USER"
  echo "[+] Usuário '$APP_USER' criado com sucesso."
fi

# ------------------------------------------------------------------------------
# 2. Ajustar propriedade do diretório da aplicação
# ------------------------------------------------------------------------------
echo "[+] Ajustando permissões do diretório da aplicação..."
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ------------------------------------------------------------------------------
# 3. Instalar dependências Node.js, se necessário
# ------------------------------------------------------------------------------
cd "$APP_DIR" || { echo "[!] Diretório $APP_DIR não encontrado. Abortando."; exit 1; }

if [ ! -d "node_modules" ]; then
  echo "[+] Pasta node_modules não encontrada. Instalando dependências..."
  npm install --production
else
  echo "[+] Dependências já instaladas."
fi

# ------------------------------------------------------------------------------
# 4. Criar diretório de logs do PM2
# ------------------------------------------------------------------------------
if [ ! -d "$LOG_DIR" ]; then
  echo "[+] Criando diretório de logs em $LOG_DIR..."
  sudo mkdir -p "$LOG_DIR"
fi
sudo chown "$APP_USER":"$APP_USER" "$LOG_DIR"

# ------------------------------------------------------------------------------
# 5. Instalar PM2, se necessário
# ------------------------------------------------------------------------------
if ! command -v pm2 &>/dev/null; then
  echo "[+] PM2 não encontrado. Instalando PM2 globalmente..."
  sudo npm install -g pm2
fi

# ------------------------------------------------------------------------------
# 6. Iniciar aplicação com PM2 (processo filho roda como $APP_USER)
# ------------------------------------------------------------------------------
echo "[+] Iniciando a aplicação via PM2..."
pm2 start ecosystem.config.js

echo "[+] Salvando configuração do PM2..."
pm2 save

# ==============================================================================
# Configuração do Nginx
# ==============================================================================

echo "[+] Verificando e configurando o Nginx..."

if ! command -v nginx &>/dev/null; then
  echo "[+] Nginx não encontrado. Instalando..."
  sudo apt update
  sudo apt install nginx -y
fi

echo "[+] Copiando nginx.conf para sites-available..."
sudo cp nginx.conf /etc/nginx/sites-available/priority-manager

if [ ! -f "/etc/nginx/sites-enabled/priority-manager" ]; then
  echo "[+] Habilitando o site no Nginx..."
  sudo ln -s /etc/nginx/sites-available/priority-manager /etc/nginx/sites-enabled/priority-manager
fi

if [ -f "/etc/nginx/sites-enabled/default" ]; then
  echo "[+] Removendo configuração padrão do Nginx..."
  sudo rm /etc/nginx/sites-enabled/default
fi

echo "[+] Testando configuração do Nginx..."
if sudo nginx -t; then
  echo "[+] Configuração OK. Recarregando e habilitando Nginx..."
  sudo systemctl reload nginx
  sudo systemctl enable nginx
else
  echo "[!] Atenção: O teste do Nginx falhou. Verifique o nginx.conf!"
fi

echo "==========================================="
echo "  Servidor e Nginx iniciados com sucesso!  "
echo "==========================================="
pm2 status priority-manager
