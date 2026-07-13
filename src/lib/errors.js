export function getAuthErrorMessage(error) {
  const code = error?.code || '';

  const messages = {
    email_address_invalid: 'Escribe un correo válido.',
    email_exists: 'No pudimos completar el registro. Intenta iniciar sesión o usa otro correo.',
    email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
    invalid_credentials: 'El correo o la contraseña no coinciden.',
    over_email_send_rate_limit: 'Espera un momento antes de solicitar otro correo.',
    over_request_rate_limit: 'Demasiados intentos. Espera un momento y vuelve a probar.',
    signup_disabled: 'El registro está temporalmente deshabilitado.',
    user_already_exists: 'No pudimos completar el registro. Intenta iniciar sesión o usa otro correo.',
    weak_password: 'Usa una contraseña de al menos 12 caracteres y evita solo espacios.',
  };

  return messages[code] || 'No pudimos completar esta acción. Revisa tu conexión e inténtalo de nuevo.';
}
