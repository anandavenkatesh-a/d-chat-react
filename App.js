/**
 * App.js
 * Entry point — initializes DB, loads identity, routes to onboarding or main app.
 */

import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initDatabase } from './src/db/database';
import useIdentityStore from './src/store/useIdentityStore';
import useContactsStore from './src/store/useContactsStore';

import WelcomeScreen     from './src/screens/onboarding/WelcomeScreen';
import UsernameScreen    from './src/screens/onboarding/UsernameScreen';
import IdentityCreated   from './src/screens/onboarding/IdentityCreated';
import HomePlaceholder   from './src/screens/home/HomePlaceholder';

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError]     = useState(null);

  const { isReady, username, loadIdentity } = useIdentityStore();
  const { loadContacts }                    = useContactsStore();

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    loadIdentity().then(() => loadContacts());
  }, [dbReady]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Failed to initialize: {error}</Text>
      </View>
    );
  }

  if (!dbReady || !isReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.hint}>Starting up…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!username ? (
            // Onboarding flow
            <>
              <Stack.Screen name="Welcome"         component={WelcomeScreen} />
              <Stack.Screen name="Username"        component={UsernameScreen} />
              <Stack.Screen name="IdentityCreated" component={IdentityCreated} />
            </>
          ) : (
            // Main app (Phase 6)
            <Stack.Screen name="Home" component={HomePlaceholder} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D0D' },
  error:  { color: '#FF5C5C', padding: 20, textAlign: 'center' },
  hint:   { marginTop: 12, color: '#555', fontSize: 13 },
});
