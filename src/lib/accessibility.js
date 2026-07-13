import { AccessibilityInfo, findNodeHandle } from 'react-native';

export function focusAccessibilityElement(refOrNode, delay = 80) {
  setTimeout(() => {
    const target = refOrNode?.current || refOrNode;
    const node = typeof target === 'number' ? target : findNodeHandle(target);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, delay);
}

export function announceForAccessibility(message) {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}
