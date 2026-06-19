# PhotoTop Web

PhotoTop Web es una aplicación web desarrollada con Angular, Node.js/Express y MySQL. Permite gestionar perfiles de usuario, publicaciones fotográficas, valoraciones, seguidores, mensajería privada, reportes y un panel de administración.

## Requisitos

Para ejecutar el proyecto solo es necesario tener instalado:

* Docker
* Docker Compose

En Windows se recomienda utilizar Docker Desktop. Antes de ejecutar el proyecto, Docker Desktop debe estar abierto y correctamente iniciado.

## Puesta en marcha

Primero se debe descomprimir el proyecto y abrir una terminal en la carpeta raíz, es decir, en la misma ubicación donde se encuentra el archivo:

```text
docker-compose.yml
```

Desde la raíz del proyecto, copiar el archivo de variables de entorno.

En Windows, desde CMD o PowerShell:

```bash
copy .env.example .env
```

En Linux/Mac:

```bash
cp .env.example .env
```

Después, levantar el proyecto con:

```bash
docker compose up --build
```

La primera ejecución puede tardar unos minutos, ya que Docker debe construir la imagen de la aplicación, instalar dependencias, levantar MySQL e importar la base de datos inicial.

Cuando el proceso finalice correctamente, la aplicación quedará disponible en:

```text
http://localhost:3000
```

## Servicios incluidos

Docker Compose levanta los siguientes servicios:

* MySQL 8
* Backend Node.js/Express
* Frontend Angular compilado y servido desde el backend

El frontend no se ejecuta mediante `ng serve`, sino que se compila y queda servido directamente desde Express en el mismo puerto de la aplicación.

## Puertos

```text
Aplicación: http://localhost:3000
MySQL: localhost:3307
```

## Base de datos

La base de datos se inicializa automáticamente desde:

```text
docker/phototop.sql
```

El archivo incluye la estructura de la base de datos y los datos de prueba necesarios para revisar la aplicación.

La importación automática se realiza al crear por primera vez el volumen de MySQL. Si la base de datos ya estaba creada previamente, Docker reutilizará el volumen existente y no volverá a importar el archivo SQL salvo que se reinicie el volumen.

Datos de conexión desde el equipo anfitrión:

```text
Host: localhost
Puerto: 3307
Base de datos: phototop
Usuario: phototop
Contraseña: phototop
```

## Usuario administrador

```text
Email: admin@phototop.local
Contraseña: admin
```

## Reiniciar la base de datos

Si se desea borrar completamente la base de datos y volver a importar los datos iniciales desde el archivo SQL, se puede ejecutar:

```bash
docker compose down -v
docker compose up --build
```

Este comando elimina el volumen de MySQL, por lo que también borra los datos creados durante las pruebas.

## Imágenes

Las imágenes de perfil y publicaciones se encuentran en:

```text
backend/uploads/
```

Esta carpeta debe entregarse junto al proyecto, ya que la base de datos almacena las rutas de esos archivos.

## Detener la aplicación

Para detener los contenedores sin borrar la base de datos:

```bash
docker compose down
```

## Estructura principal

```text
backend/              API REST con Node.js y Express
frontend/             Aplicación Angular
docker/phototop.sql   Script de inicialización de la base de datos
docker-compose.yml    Configuración de Docker Compose
.env.example          Variables de entorno de ejemplo
README.md             Instrucciones de ejecución del proyecto
```
