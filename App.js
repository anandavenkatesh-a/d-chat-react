/**
 * App.js
 * Entry point — initializes DB, loads identity, routes to onboarding or main app.
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

// Onboarding
import WelcomeScreen      from './src/screens/onboarding/WelcomeScreen';
import UsernameScreen     from './src/screens/onboarding/UsernameScreen';

// Main app
import ContactListScreen  from './src/screens/home/ContactListScreen';
import ChatScreen         from './src/screens/chat/ChatScreen';
import AddContactScreen   from './src/screens/contacts/AddContactScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError]     = useState(null);

  const { isReady, username, loadIdentity } = useIdentityStore();
  const { loadContacts }                    = useContactsStore();

  useSocketSetup();

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    loadIdentity().then(() => loadContacts());
  }, [dbReady]);

  // Request notification permission once the user has an identity
  // (no point asking before onboarding completes).
  useEffect(() => {
    if (!username) return;
    setupNotifications();
    // Clear stale badge/tray notifications whenever the app is opened —
    // unread state is now visible directly in the contact list instead.
    clearAllNotifications();
  }, [username]);

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
          {!username ? (
            <>
              <Stack.Screen name="Welcome"  component={WelcomeScreen} />
              <Stack.Screen name="Username" component={UsernameScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Home"       component={ContactListScreen} />
              <Stack.Screen name="Chat"       component={ChatScreen} />
              <Stack.Screen name="AddContact" component={AddContactScreen} />
            </>
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
