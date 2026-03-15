import { StytchUI, useStytch } from '@stytch/react-native';
import { app$ } from '@justtellme/state';
import { useValue } from '@legendapp/state/react';
import React, { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { stytchClient, stytchUIConfig } from '@/lib/stytch';

function LoggedInView() {
  const stytch = useStytch();
  const user = useValue(app$.auth.user);

  return (
    <ThemedView style={styles.loggedInContainer}>
      <ThemedText type="subtitle">
        Welcome{user?.name ? `, ${user.name}` : ''}
      </ThemedText>
      {user?.emails && user.emails.length > 0 && (
        <ThemedText themeColor="textSecondary">{user.emails.join(', ')}</ThemedText>
      )}
      <Pressable
        style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
        onPress={() => stytch.session.revoke()}>
        <ThemedText type="small">Log out</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function AccountScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const init = useValue(app$.auth.initialized);
  const hasSession = useValue(app$.auth.hasSession);

  useEffect(() => {
    if (init) {
      app$.loaded.set(true);
    }
  }, [init]);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Account</ThemedText>
        </ThemedView>

        <ThemedView style={styles.authContainer}>
          {hasSession ? (
            <LoggedInView />
          ) : (
            <StytchUI client={stytchClient} config={stytchUIConfig} />
          )}
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  authContainer: {
    paddingHorizontal: Spacing.four,
  },
  loggedInContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
  logoutButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: '#e0e0e0',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
