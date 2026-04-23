#!/bin/bash

# ==============================================================================
# Script para iniciar o servidor Priority Manager na Máquina Virtual (VM)
# ==============================================================================

echo "==========================================="
echo "  Iniciando o Priority Manager na VM...    "
echo "==========================================="

# 1. Verifica e instala dependências do Node.js, caso necessário
if [ ! -d "node_modules" ]; then
  echo "[+] Pasta node_modules não encontrada. Instalando dependências..."
  npm install --production
else
  echo "[+] Dependências já instaladas."
fi

# 2. Verifica se a pasta de logs do PM2 existe (referenciado no ecosystem.config.js)
if [ ! -d "/var/log/pm2" ]; then
  echo "[+] Criando diretório de logs do PM2 em /var/log/pm2..."
  sudo mkdir -p /var/log/pm2
  sudo chown $USER:$USER /var/log/pm2
fi

# 3. Verifica se o PM2 está instalado
if ! command -v pm2 &> /dev/null
then
    echo "[+] PM2 não encontrado. Instalando PM2 globalmente..."
    sudo npm install -g pm2
fi

# 4. Inicia ou reinicia o serviço com o PM2
echo "[+] Iniciando a aplicação via PM2..."
pm2 start ecosystem.config.js

# 5. Salva a lista de processos para reiniciar automaticamente em caso de reboot
echo "[+] Salvando configuração do PM2..."
pm2 save

# ==============================================================================
# Configuração do Nginx
# ==============================================================================

echo "[+] Verificando e configurando o Nginx..."

# Verifica se o Nginx está instalado, caso não, instala
if ! command -v nginx &> /dev/null
then
    echo "[+] Nginx não encontrado. Instalando..."
    sudo apt update
    sudo apt install nginx -y
fi

# Copia o arquivo de configuração para o Nginx
echo "[+] Copiando nginx.conf para sites-available..."
sudo cp nginx.conf /etc/nginx/sites-available/priority-manager

# Habilita o site criando um link simbólico, se ainda não existir
if [ ! -f "/etc/nginx/sites-enabled/priority-manager" ]; then
    echo "[+] Habilitando o site no Nginx..."
    sudo ln -s /etc/nginx/sites-available/priority-manager /etc/nginx/sites-enabled/priority-manager
fi

# Remove a página default do Nginx (para liberar a porta 80), se existir
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo "[+] Removendo configuração padrão do Nginx..."
    sudo rm /etc/nginx/sites-enabled/default
fi

# Testa a configuração e recarrega o serviço
echo "[+] Testando configuração do Nginx..."
if sudo nginx -t; then
    echo "[+] Configuração OK. Recarregando e habilitando Nginx..."
    sudo systemctl reload nginx
    sudo systemctl enable nginx
else
    echo "[!] Atenção: O teste do Nginx falhou. Verifique se há erros no nginx.conf!"
fi

echo "==========================================="
echo "  Servidor e Nginx iniciados com sucesso!  "
echo "==========================================="
pm2 status priority-manager
