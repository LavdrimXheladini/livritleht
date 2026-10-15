import { useLocalSearchParams } from 'expo-router';

import { MoveScreen } from '@/components/customer/move-screen';

/** One of the customer's moves (`?id=`): their own only (RLS). */
export default function Move() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <MoveScreen id={id} />;
}
