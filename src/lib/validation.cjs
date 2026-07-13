'use strict';

function validateCredentials({ email, password, confirmation }) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Escribe un correo válido.';
  if (Array.from(password).length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  if (Array.from(password).length > 128) return 'La contraseña no puede superar 128 caracteres.';
  if (!/\S/.test(password)) return 'La contraseña no puede contener solo espacios.';
  if (confirmation !== undefined && password !== confirmation) return 'Las contraseñas no coinciden.';
  return null;
}

function parseWeightInput(value) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const weight = Number(normalized);
  return weight > 0 && weight <= 500 ? weight : Number.NaN;
}

module.exports = {
  parseWeightInput,
  validateCredentials,
};
