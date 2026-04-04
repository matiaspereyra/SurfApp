import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Mail, ShieldCheck } from 'lucide-react-native';
import { isAuthAvailable, sendOtpCode, verifyOtpCode } from '../services/authService';
import { UI_COLORS, UI_RADIUS, UI_SPACE, UI_TYPE } from '../theme/ui';

export default function AuthScreen() {
  const RESEND_COOLDOWN_SECONDS = 90;
  const MIN_TOKEN_LENGTH = 6;

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const otpInputRef = useRef(null);

  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid = useMemo(() => /.+@.+\..+/.test(email.trim()), [email]);
  const normalizedToken = useMemo(() => otp.replace(/\s+/g, '').trim(), [otp]);
  const isOnOtpStep = otpSent && !isEditingEmail;
  const canReturnToActiveCode = isEditingEmail && otpSent && normalizedEmail === otpEmail && resendCooldown > 0;
  const canSendOtp = isAuthAvailable && isEmailValid && !loading;
  const canVerifyOtp = isAuthAvailable && normalizedToken.length >= MIN_TOKEN_LENGTH && !loading;

  useEffect(() => {
    if (!otpSent || resendCooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setResendCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpSent, resendCooldown]);

  useEffect(() => {
    if (!otpSent) return;

    const timerId = setTimeout(() => {
      otpInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timerId);
  }, [otpSent]);

  const handleSendOtp = async () => {
    setError('');
    setInfo('');

    if (!isEmailValid) {
      setError('Ingresa un email valido');
      return;
    }

    setLoading(true);
    const result = await sendOtpCode(normalizedEmail);
    setLoading(false);

    if (!result.ok) {
      setError(result.error || 'No se pudo enviar el codigo');
      return;
    }

    setOtpSent(true);
    setOtpEmail(normalizedEmail);
    setIsEditingEmail(false);
    setOtp('');
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo('Revisa tu email y pega el codigo o token de acceso.');
  };

  const handleChangeEmail = () => {
    setIsEditingEmail(true);
    Keyboard.dismiss();
    setError('');
    setInfo('');
  };

  const handleReturnToCode = () => {
    setIsEditingEmail(false);
    setError('');
    setInfo('Puedes seguir usando el codigo activo.');
  };

  const handleVerifyOtp = async () => {
    setError('');
    setInfo('');

    if (!normalizedToken || normalizedToken.length < MIN_TOKEN_LENGTH) {
      setError('Ingresa el codigo o token recibido por email');
      return;
    }

    setLoading(true);
    const result = await verifyOtpCode({
      email: normalizedEmail,
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.card}>
        <Text style={styles.title}>Surf Waze</Text>
        <Text style={styles.subtitle}>Accede con email para activar alertas y reputacion real.</Text>

        <View style={styles.stepRow}>
          <View style={[styles.stepPill, styles.stepPillActive]}>
            <Text style={[styles.stepPillText, styles.stepPillTextActive]}>1. Email</Text>
          </View>
          <View style={[styles.stepPill, isOnOtpStep ? styles.stepPillActive : null]}>
            <Text style={[styles.stepPillText, isOnOtpStep ? styles.stepPillTextActive : null]}>2. Codigo</Text>
          </View>
        </View>

        {!isAuthAvailable ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>Falta configurar Supabase. Crea tu archivo .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text>
          </View>
        ) : null}

        <View style={[styles.inputWrap, error && !isEmailValid ? styles.inputWrapError : null]}>
          <Mail size={16} color="#8EA2B8" />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            keyboardType="email-address"
            cursorColor="#0C4A6E"
            selectionColor="#0C4A6E"
            style={styles.input}
            returnKeyType={isOnOtpStep ? 'next' : 'send'}
            onSubmitEditing={() => {
              if (!isOnOtpStep && canSendOtp) handleSendOtp();
            }}
          />
        </View>

        {isOnOtpStep ? (
          <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
            <ShieldCheck size={16} color="#8EA2B8" />
            <TextInput
              ref={otpInputRef}
              value={otp}
              onChangeText={setOtp}
              placeholder="Codigo o token de email"
              placeholderTextColor="#6B7280"
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              cursorColor="#0C4A6E"
              selectionColor="#0C4A6E"
              style={styles.input}
              maxLength={128}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canVerifyOtp) handleVerifyOtp();
              }}
            />
          </View>
        ) : null}

        {isOnOtpStep ? (
          <Text style={styles.hintText}>
            {resendCooldown > 0
              ? `Puedes reenviar en ${resendCooldown}s.`
              : 'Si no recibiste el codigo, puedes reenviarlo ahora.'}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, (isOnOtpStep ? !canVerifyOtp : !canSendOtp) ? styles.primaryBtnDisabled : null]}
          onPress={isOnOtpStep ? handleVerifyOtp : handleSendOtp}
          disabled={isOnOtpStep ? !canVerifyOtp : !canSendOtp}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? 'Cargando...' : isOnOtpStep ? 'Verificar codigo' : otpSent ? 'Enviar codigo nuevo' : 'Enviar codigo'}
          </Text>
        </TouchableOpacity>

        {isOnOtpStep && resendCooldown === 0 ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={handleSendOtp}
            disabled={loading}
          >
            <Text style={styles.linkText}>Reenviar codigo</Text>
          </TouchableOpacity>
        ) : null}

        {isOnOtpStep ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={handleChangeEmail}
            disabled={loading}
          >
            <Text style={styles.linkText}>Cambiar email</Text>
          </TouchableOpacity>
        ) : null}

        {canReturnToActiveCode ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={handleReturnToCode}
            disabled={loading}
          >
            <Text style={styles.linkText}>Volver al codigo activo</Text>
          </TouchableOpacity>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: UI_RADIUS.sm,
    paddingHorizontal: 10,
    height: 44,
  },
  inputWrapError: {
    borderColor: '#EF4444',
  },
  input: {
    flex: 1,
    color: '#0F172A',
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: UI_RADIUS.pill,
    backgroundColor: '#E6EEF6',
    borderWidth: 1,
    borderColor: '#CBD8E6',
  },
  linkText: {
    color: '#0F3D63',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF7D7D',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  infoText: {
    color: '#0F3D63',
    fontSize: UI_TYPE.bodySm,
    fontWeight: '700',
  },
  hintText: {
    color: UI_COLORS.textMuted,
    fontSize: UI_TYPE.caption,
    fontWeight: '600',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepPill: {
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stepPillActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#E0F2FE',
  },
  stepPillText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  stepPillTextActive: {
    color: '#0C4A6E',
  },
});
