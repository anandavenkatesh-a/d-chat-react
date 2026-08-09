/**
 * App.js
 * Entry point.
 *
 * Routing, updated:
 *   DB init → identity loaded (may be null now — no more auto-create)
 *     → if !deviceId:      WelcomeChoiceScreen (new account vs restore)
 *     → if deviceId && !isRegistered: RegistrationScreen (puzzle gauntlet)
 *     → else:              main app stack
 *
 * A restored identity (via WelcomeChoiceScreen's "Restore from Backup")
 * sets deviceId AND isRegistered together, so it skips straight to the
 * main app stack, correctly bypassing the puzzle — a genuinely new
 * identity only sets deviceId, so it still goes through registration
 * as before.
 */

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

import WelcomeChoiceScreen from './src/screens/onboarding/WelcomeChoiceScreen';
import RegistrationScreen  from './src/screens/onboarding/RegistrationScreen';
import BackupScreen        from './src/screens/onboarding/BackupScreen';
import ContactListScreen   from './src/screens/home/ContactListScreen';
import ChatScreen          from './src/screens/chat/ChatScreen';
import AddContactScreen    from './src/screens/contacts/AddContactScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError]     = useState(null);

  const { isReady, deviceId, isRegistered, loadIdentity } = useIdentityStore();
  const { loadContacts }                                  = useContactsStore();

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

  useEffect(() => {
    if (!isRegistered) return;
    setupNotifications();
    clearAllNotifications();
  }, [isRegistered]);

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
          {!deviceId ? (
            <Stack.Screen name="WelcomeChoice" component={WelcomeChoiceScreen} />
          ) : !isRegistered ? (
            <Stack.Screen name="Registration" component={RegistrationScreen} />
          ) : (
            <>
              <Stack.Screen name="Home"       component={ContactListScreen} />
              <Stack.Screen name="Chat"       component={ChatScreen} />
              <Stack.Screen name="AddContact" component={AddContactScreen} />
              <Stack.Screen name="Backup"     component={BackupScreen} />
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
