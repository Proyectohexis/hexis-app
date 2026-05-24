const fs = require('fs');

const content = `import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import GoalScreen from '../screens/onboarding/GoalScreen';
import NameScreen from '../screens/onboarding/NameScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import HabitsScreen from '../screens/habits/HabitsScreen';
import ProgressScreen from '../screens/progress/ProgressScreen';
import { colors, typography } from '../theme';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator({ route }) {
  const name = route?.params?.name || 'Atleta';
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.secondary,
          borderTopColor: colors.border.subtle,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        initialParams={{ name }}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{String.fromCharCode(8962)}</Text>,
        }}
      />
      <Tab.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          tabBarLabel: 'Habitos',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{String.fromCharCode(10003)}</Text>,
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarLabel: 'Progreso',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{String.fromCharCode(8679)}</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Goal" component={GoalScreen} />
        <Stack.Screen name="Name" component={NameScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
`;

fs.writeFileSync('src/navigation/AppNavigator.js', content);
console.log('AppNavigator creado correctamente');