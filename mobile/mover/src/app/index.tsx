import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, useAuth } from '@ranktrip/mobile';

export default function Home() {
  const { t } = useTranslation();
  const { supabase } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-4 px-4">
        <Text className="text-3xl font-bold text-ink-900">{t('mover.homeTitle')}</Text>
        <Text className="text-base text-ink-500">{t('mover.homeSubtitle')}</Text>
        <Button variant="link" title={t('common.signOut')} onPress={() => void supabase.auth.signOut()} />
      </View>
    </SafeAreaView>
  );
}
