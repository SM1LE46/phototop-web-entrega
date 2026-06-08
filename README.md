# PhotoTop Web

PhotoTop Web es una aplicación web desarrollada con Angular, Node.js/Express y MySQL. Permite gestionar perfiles de usuario, publicaciones fotográficas, valoraciones, seguidores, mensajería privada, reportes y un panel de administración.

## Requisitos

Para ejecutar el proyecto solo es necesario tener instalado:

* Docker
* Docker Compose

## Puesta en marcha

Desde la raíz del proyecto, copiar el archivo de variables de entorno:

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

La aplicación quedará disponible en:

```text
http://localhost:3000
```

## Servicios incluidos

Docker Compose levanta los siguientes servicios:

* MySQL 8
* Backend Node.js/Express
* Frontend Angular compilado y servido desde el backend

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

Para borrar el volumen de MySQL y volver a importar la base de datos desde el archivo SQL:

```bash
docker compose down -v
docker compose up --build
```

## Imágenes

Las imágenes de perfil y publicaciones se encuentran en:

```text
backend/uploads/
```

Esta carpeta debe entregarse junto al proyecto, ya que la base de datos almacena las rutas de esos archivos.

## Estructura principal

```text
backend/              API REST con Node.js y Express
frontend/             Aplicación Angular
docker/phototop.sql   Script de inicialización de la base de datos
docker-compose.yml    Configuración de Docker Compose
.env.example          Variables de entorno de ejemplo
README.md             Instrucciones de ejecución del proyecto
```
