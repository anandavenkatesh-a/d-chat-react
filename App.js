/**
 * App.js
 * Entry point — initializes DB, generates identity automatically (no
 * onboarding input required — no username, nothing to type), connects
 * to the relay, and shows the main app.
 *
 * There is no onboarding flow anymore: identity (keypair + device_id)
 * is generated the moment the app is first launched, entirely
 * automatically, inside useIdentityStore.loadIdentity(). By the time
 * this component's loading screen finishes, identity is guaranteed to
 * already exist — so the navigator never needs a separate "onboarding
 * stack" branch at all.
 */

// MUST be the very first import — patches global.crypto.getRandomValues()
// which tweetnacl (our E2EE library) requires for secure random number
// generation. Without this, nacl.randomBytes() throws "no PRNG".
import 'react-native-get-random-values';

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initDatabase }      from './src/db/database';
import useIdentityStore      from './src/store/useIdentityStore';
import useContactsStore      from './src/store/useContactsStore';
import { useSocketSetup }    from './src/hooks/useSocketSetup';
import { setupNotifications, clearAllNotifications } from './src/services/notifications';

// Main app (no onboarding stack — identity is auto-generated, see above)
import ContactListScreen  from './src/screens/home/ContactListScreen';
import ChatScreen         from './src/screens/chat/ChatScreen';
import AddContactScreen   from './src/screens/contacts/AddContactScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError]     = useState(null);

  const { isReady, deviceId, loadIdentity } = useIdentityStore();
  const { loadContacts }                    = useContactsStore();

  useSocketSetup();

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    // loadIdentity() automatically generates a fresh keypair + device_id
    // on the very first call if none exists yet — no user input needed.
    loadIdentity().then(() => loadContacts());
  }, [dbReady]);

  useEffect(() => {
    if (!deviceId) return;
    setupNotifications();
    clearAllNotifications();
  }, [deviceId]);

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
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="Home"       component={ContactListScreen} />
          <Stack.Screen name="Chat"       component={ChatScreen} />
          <Stack.Screen name="AddContact" component={AddContactScreen} />
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
