import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Mail, ShieldCheck } from 'lucide-react-native';
import { isAuthAvailable, sendOtpCode, verifyOtpCode } from '../services/authService';
import { UI_COLORS, UI_RADIUS, UI_SPACE, UI_TYPE } from '../theme/ui';

export default function AuthScreen() {
  const RESEND_COOLDOWN_SECONDS = 90;

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isEmailValid = useMemo(() => /.+@.+\..+/.test(email.trim()), [email]);

  useEffect(() => {
    if (!otpSent || resendCooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setResendCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpSent, resendCooldown]);

  const handleSendOtp = async () => {
    setError('');
    setInfo('');

    if (!isEmailValid) {
      setError('Ingresa un email valido');
      return;
    }

    setLoading(true);
    const result = await sendOtpCode(email.trim().toLowerCase());
    setLoading(false);

    if (!result.ok) {
      setError(result.error || 'No se pudo enviar el codigo');
      return;
    }

    setOtpSent(true);
    setOtp('');
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo('Revisa tu email y pega el codigo o token de acceso.');
  };

  const handleResetToSendStep = () => {
    setOtpSent(false);
    setOtp('');
    setResendCooldown(0);
    setError('');
    setInfo('');
  };

  const handleVerifyOtp = async () => {
    setError('');
    setInfo('');

    if (!otp || otp.trim().length < 6) {
      setError('Ingresa el codigo o token recibido por email');
      return;
    }

    const normalizedToken = otp.replace(/\s+/g, '').trim();

    setLoading(true);
    const result = await verifyOtpCode({
      email: email.trim().toLowerCase(),
      token: normalizedToken,
    });
    setLoading(false);

    if (!result.ok) {
      const authError = (result.error || '').toLowerCase();
      const expired = authError.includes('expired') || authError.includes('invalid') || authError.includes('otp');

      if (expired) {
        setOtpSent(false);
        setOtp('');
        setResendCooldown(0);
        setError('El codigo expiro o no es valido. Envia uno nuevo.');
        return;
      }

      setError(result.error || 'Codigo invalido o expirado');
      return;
    }

    setInfo('Login correcto. Redirigiendo...');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.atmosphereOne} pointerEvents="none" />
      <View style={styles.atmosphereTwo} pointerEvents="none" />

      <View style={styles.card}>
        <Text style={styles.title}>Surf ID</Text>
        <Text style={styles.subtitle}>Accede con email para activar alertas y reputacion real.</Text>

        {!isAuthAvailable ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>Falta configurar Supabase. Crea tu archivo .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text>
          </View>
        ) : null}

        <View style={styles.inputWrap}>
          <Mail size={16} color="#8EA2B8" />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor="#5E6C7A"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        {otpSent ? (
          <View style={styles.inputWrap}>
            <ShieldCheck size={16} color="#8EA2B8" />
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="Codigo o token de email"
              placeholderTextColor="#5E6C7A"
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              maxLength={128}
            />
          </View>
        ) : null}

        {otpSent ? (
          <Text style={styles.hintText}>
            Reenvio en {RESEND_COOLDOWN_SECONDS}s. La expiracion del codigo depende de tu configuracion en Supabase.
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, loading ? styles.primaryBtnDisabled : null]}
          onPress={otpSent ? handleVerifyOtp : handleSendOtp}
          disabled={loading || !isAuthAvailable}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? 'Cargando...' : otpSent ? 'Verificar codigo' : 'Enviar codigo'}
          </Text>
        </TouchableOpacity>

        {otpSent && resendCooldown > 0 ? (
          <Text style={styles.infoText}>Podras reenviar codigo en {resendCooldown}s</Text>
        ) : null}

        {otpSent && resendCooldown === 0 ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={handleSendOtp}
            disabled={loading}
          >
            <Text style={styles.linkText}>Reenviar codigo</Text>
          </TouchableOpacity>
        ) : null}

        {otpSent && resendCooldown === 0 ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={handleResetToSendStep}
            disabled={loading}
          >
            <Text style={styles.linkText}>Volver a enviar codigo</Text>
          </TouchableOpacity>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.appBg,
    justifyContent: 'center',
    padding: UI_SPACE.lg,
  },
  atmosphereOne: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: '#0E2F42',
    opacity: 0.32,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -150,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#0B1E2C',
    opacity: 0.36,
  },
  card: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: UI_RADIUS.lg,
    padding: UI_SPACE.lg,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 12,
    elevation: 9,
  },
  title: {
    color: UI_COLORS.textPrimary,
    fontSize: UI_TYPE.titleLg,
    fontWeight: '900',
  },
  subtitle: {
    color: UI_COLORS.textSecondary,
    fontSize: UI_TYPE.bodySm,
    lineHeight: 18,
  },
  warnBox: {
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#643434',
    borderRadius: 10,
    padding: 10,
  },
  warnText: {
    color: '#FFC5C5',
    fontSize: 12,
    lineHeight: 17,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A151F',
    borderWidth: 1,
    borderColor: '#2D4C62',
    borderRadius: UI_RADIUS.sm,
    paddingHorizontal: 10,
    height: 44,
  },
  input: {
    flex: 1,
    color: UI_COLORS.textPrimary,
    fontSize: UI_TYPE.bodyMd,
  },
  primaryBtn: {
    backgroundColor: UI_COLORS.accent,
    borderRadius: UI_RADIUS.sm,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: UI_COLORS.accentText,
    fontSize: UI_TYPE.bodyMd,
    fontWeight: '800',
  },
  linkBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  linkText: {
    color: '#9FD8B4',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF7D7D',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  infoText: {
    color: '#9FD8B4',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  hintText: {
    color: UI_COLORS.textMuted,
    fontSize: UI_TYPE.caption,
    fontWeight: '600',
  },
});
