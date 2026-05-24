import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import GoalScreen from '../screens/onboarding/GoalScreen';
import NameScreen from '../screens/onboarding/NameScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Goal" component={GoalScreen} />
        <Stack.Screen name="Name" component={NameScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}