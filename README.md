# SurfApp

SurfApp es una aplicación móvil construida con Expo y React Native para mostrar pronósticos de surf, mapas de spots y comunidad. Este repositorio incluye una integración con Supabase para autenticación, datos de usuario y almacenamiento de pronósticos.

## Tabla de contenidos

- [Requisitos](#requisitos)
- [Instalación](#instalaci%C3%B3n)
- [Configuración de Supabase](#configuraci%C3%B3n-de-supabase)
- [Variables de entorno](#variables-de-entorno)
- [Ejecución local](#ejecuci%C3%B3n-local)
- [Compilar para producción](#compilar-para-producci%C3%B3n)
- [Estructura de directorios](#estructura-de-directorios)
- [Notas útiles](#notas-%C3%BAtiles)

## Requisitos

- macOS
- Node.js v20 (se usa `.nvmrc`)
- npm o Yarn
- Git
- Expo CLI / EAS CLI
- Xcode (para iOS local y builds)
- Android Studio / SDK (para Android local y builds)

## Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/matiaspereyra/SurfApp.git
   cd SurfApp
   ```

2. Usa la versión de Node indicada:
   ```bash
   nvm install
   nvm use
   ```

3. Instala dependencias:
   ```bash
   npm install
   ```

4. Crea el archivo de entorno a partir del ejemplo:
   ```bash
   cp .env.example .env
   ```

## Configuración de Supabase

SurfApp utiliza Supabase para autenticación y almacenamiento de datos. Configura un proyecto en [Supabase](https://supabase.com) y crea las siguientes variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Recomendación adicional

- Habilita el proveedor de autenticación `Email` o `OTP` en Authentication > Providers.
- Asegúrate de que la URL y la clave anónima sean públicas y estén disponibles en el cliente.

## Inicializar Supabase y migraciones

Este repositorio ya incluye el esquema y las migraciones necesarias en `supabase/schema.sql` y `supabase/migrations/`.

Si usas la CLI de Supabase, los pasos recomendados son:

1. Instala la CLI si no la tienes:
   ```bash
   npm install -g supabase
   # o
   brew install supabase/tap/supabase
   ```
2. Autentica tu cuenta:
   ```bash
   supabase login
   ```
3. Enlaza o usa tu proyecto Supabase existente. Si no tienes `supabase/config.toml`, puedes crear el proyecto desde la web y luego usar:
   ```bash
   supabase link --project-ref <project-ref>
   ```
4. Aplica el esquema/migraciones:
   ```bash
   supabase db push
   ```

### Deploy de Edge Functions

El proyecto contiene funciones Edge en `supabase/functions/`. Para desplegarlas:

```bash
supabase functions deploy fetch-forecast --project-ref <project-ref>
supabase functions deploy send-community-push --project-ref <project-ref>
supabase functions deploy send-spot-alerts --project-ref <project-ref>
```

### Usando el panel web de Supabase

Si prefieres trabajar desde el editor web de Supabase:

1. Entra a tu proyecto Supabase.
2. Abre `SQL Editor` y ejecuta el contenido de `supabase/schema.sql` para crear tablas, índices y funciones definidas allí.
3. Abre `Database > Migrations` y revisa si ya se creó la tabla base; si no, usa `Table Editor` o `SQL Editor` para aplicar los cambios según `supabase/migrations/`.
4. En `Functions`, añade nuevas funciones con los mismos nombres que `supabase/functions/` y copia el código de cada carpeta.
5. Para funciones Edge, selecciona `Functions > New Function`, nómbrala `fetch-forecast`, `send-community-push` o `send-spot-alerts`, luego ubica el código correspondiente.

> Nota: La app usa RPCs y tablas del esquema almacenado en `supabase/schema.sql`, así que el catálogo de migraciones debe estar sincronizado con el proyecto.

## Variables de entorno

En el archivo `.env`, define:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Ejecución local

### 1. Arrancar Expo en modo desarrollo

```bash
npm run start
```

### 2. Ejecutar en iOS (simulador o dispositivo conectado)

```bash
npm run ios
```

### 3. Ejecutar en Android

```bash
npm run android
```

### 4. Abrir en web

```bash
npm run web
```

## Compilar para producción

### iOS

```bash
npm run build:ios:prod
```

### Generar un Release local de iOS

```bash
npm run ios:release
```

## Estructura de directorios

- `App.js` / `index.js`: entradas principales de la app.
- `assets/`: íconos, splash screen y recursos estáticos.
- `src/`: código fuente principal.
  - `components/`: componentes UI reutilizables.
  - `screens/`: pantallas de la app.
  - `services/`: lógica de datos y llamadas a APIs.
  - `lib/`: configuración de utilidades como Supabase.
- `supabase/`: esquema SQL, funciones de Edge y migraciones.
- `scripts/`: utilidades de recuperación y mantenimiento.

## Notas útiles

- El archivo `app.json` define el bundle identifier iOS y el paquete Android.
- `eas.json` contiene perfiles de build para `development`, `preview` y `production`.
- El proyecto usa `expo` y `eas-cli` para builds y despliegues.

## Problemas comunes

- Si la app no arranca por cache, prueba:
  ```bash
  npx expo start --clear
  ```
- Si iOS falla, limpia Pods y DerivedData:
  ```bash
  rm -rf ios/Pods ios/Podfile.lock ~/Library/Developer/Xcode/DerivedData
  ```

## Enlaces

- Repo: https://github.com/matiaspereyra/SurfApp
- Supabase: https://app.supabase.com
- Expo: https://expo.dev
