# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Dev build local (sem nuvem EAS)

O app usa módulos nativos (`expo-local-authentication` para o bloqueio biométrico), que **não funcionam no Expo Go**. Para testar no celular é preciso gerar uma **dev build localmente**:

1. Pré-requisitos (já no projeto):
   - `ANDROID_HOME` apontando para o Android SDK.
   - Dispositivo conectado via USB (`adb devices`) ou emulador aberto.
   - `npm install` já executado.

2. Gerar e instalar a dev build no Android (roda prebuild + Gradle + instala no aparelho):

   ```bash
   npx expo run:android
   ```

   Para rebuild limpo:

   ```bash
   npx expo run:android --no-build-cache
   ```

3. Após instalar o ícone "iFujão" (dev client) no celular, rode o Metro normalmente:

   ```bash
   npx expo start
   ```

   e abra o app pelo dev client (não pelo Expo Go).

### Tela de bloqueio (biometria do celular)

O bloqueio ao abrir o app usa `expo-local-authentication` e fica em `src/components/AppLock.tsx`, integrado em `app/_layout.tsx`. É **opcional**: se o dispositivo não tiver biometria/hardware, o bloqueio é pulado automaticamente. No Expo Go o módulo nativo não existe, então o bloqueio também é ignorado — por isso a dev build é necessária para ver o bloqueio real.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
