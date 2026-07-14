'use strict';

const React = require('react');
const {
  AccessibilityInfo,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} = require('react-native');

const {
  ARTIFACT_DATE,
  DAYS,
  DECISIONS,
  METRIC_STATES,
  PROTOTYPE_VERSION,
  REDUCE_MODES,
  REFLECTION_OPTIONS,
  SCENARIOS,
  SIMULATIONS,
} = require('./src/fixtures');
const {
  DEFAULT_TEAM_CONFIG,
  acknowledgeRollover,
  attemptConfirmation,
  buildAfterCommitment,
  canShowReceipt,
  createSession,
  dayLabels,
  describeChange,
  getSourceCommitment,
  isDraftValid,
  isSessionEnvelopeTrusted,
  rebuildAfterConflict,
  resetForDecision,
  resetForReduceMode,
  toggleDay,
} = require('./src/model');
const { getRuntimeIsolationStatus } = require('./src/runtimeIsolation');
const { colors } = require('./src/theme');

function SectionLabel({ children }) {
  return <Text accessibilityRole="header" style={styles.sectionLabel}>{children}</Text>;
}

function Card({ children, accessibilityLabel, alert = false }) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={alert ? 'assertive' : 'none'}
      accessibilityRole={alert ? 'alert' : undefined}
      style={[styles.card, alert && styles.alertCard]}
    >
      {children}
    </View>
  );
}

function ChoiceCard({ label, description, selected, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View aria-hidden style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {description ? <Text style={styles.choiceDescription}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

function PrimaryButton({ children, onPress, disabled = false, accessibilityHint }) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>
        {children}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({ children, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

function StepHeader({ step, eyebrow, title, onBack, backLabel }) {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel={backLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backButtonText}>‹ {backLabel}</Text>
        </Pressable>
        <Text accessibilityLabel={`Paso ${step} de 3`} style={styles.stepText}>
          Paso {step} de 3
        </Text>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

function TeamSetup({ config, onChange, onStart }) {
  const scenarioEntries = Object.entries(SCENARIOS);
  const metric = METRIC_STATES.find((item) => item.id === config.metricStateId);
  const simulation = SIMULATIONS.find((item) => item.id === config.simulationId);
  const isolation = getRuntimeIsolationStatus();

  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.teamBadge}>
        <Text style={styles.teamBadgeText}>U0 · DATOS SINTÉTICOS · SOLO EQUIPO</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Preparación del recorrido interno
      </Text>
      <Text style={styles.lead}>
        Configura un escenario congelado antes de entregar el teléfono. Esta pantalla está separada del flujo participante.
      </Text>

      <Card>
        <SectionLabel>ARTEFACTO</SectionLabel>
        <Text style={styles.cardTitle}>{PROTOTYPE_VERSION}</Text>
        <Text style={styles.body}>Fecha del artefacto: {ARTIFACT_DATE}</Text>
        <Text style={styles.body}>Harness local sin cuentas, persistencia, telemetría ni cambios reales.</Text>
        <Text style={styles.warningText}>No aprobado para piloto contabilizable.</Text>
        <Text style={styles.warningText}>El recorrido no admite entrada libre: todas las respuestas son fixtures ficticios.</Text>
      </Card>

      <Card alert={!isolation.enforced}>
        <SectionLabel>AISLAMIENTO DE EJECUCIÓN</SectionLabel>
        <Text style={styles.cardTitle}>{isolation.label}</Text>
        <Text style={styles.body}>{isolation.detail}</Text>
        {!isolation.enforced ? (
          <Text style={styles.warningText}>Este modo sirve para revisar la interfaz; no cuenta como sesión U0.</Text>
        ) : null}
      </Card>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>ESCENARIO ASIGNADO</SectionLabel>
        {scenarioEntries.map(([key, scenario]) => (
          <ChoiceCard
            description={scenario.id}
            key={key}
            label={scenario.teamLabel}
            onPress={() => onChange({ ...config, scenarioKey: key })}
            selected={config.scenarioKey === key}
          />
        ))}
      </View>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>ESTADO DE MÉTRICA</SectionLabel>
        {METRIC_STATES.map((item) => (
          <ChoiceCard
            description={item.variantId}
            key={item.id}
            label={item.label}
            onPress={() => onChange({ ...config, metricStateId: item.id })}
            selected={config.metricStateId === item.id}
          />
        ))}
      </View>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>SIMULACIÓN LOCAL</SectionLabel>
        {SIMULATIONS.map((item) => (
          <ChoiceCard
            description={item.variantId}
            key={item.id}
            label={item.label}
            onPress={() => onChange({ ...config, simulationId: item.id })}
            selected={config.simulationId === item.id}
          />
        ))}
      </View>

      <Card>
        <SectionLabel>ASIGNACIÓN CONGELADA</SectionLabel>
        <Text style={styles.mono}>{SCENARIOS[config.scenarioKey].id}</Text>
        <Text style={styles.mono}>{metric.variantId}</Text>
        <Text style={styles.mono}>{simulation.variantId}</Text>
      </Card>

      <PrimaryButton
        accessibilityHint="Borra cualquier recorrido anterior y abre el paso uno con datos sintéticos."
        onPress={onStart}
      >
        Abrir recorrido interno
      </PrimaryButton>
    </ScrollView>
  );
}

function MetricCard({ scenario, metricStateId }) {
  const first = scenario.metric.records[0];
  const last = scenario.metric.records[scenario.metric.records.length - 1];
  const delta = last.value - first.value;
  let content;

  if (metricStateId === 'not_configured') {
    content = <Text style={styles.body}>Este plan no usa una métrica opcional.</Text>;
  } else if (metricStateId === 'no_records') {
    content = (
      <Text style={styles.body}>No registraste una métrica esta semana. No es necesaria para decidir.</Text>
    );
  } else if (metricStateId === 'one_record') {
    content = (
      <>
        <Text style={styles.cardTitle}>{scenario.metric.name}</Text>
        <Text style={styles.body}>
          1 registro: {first.value} {scenario.metric.unit} el {first.day}.
        </Text>
        <Text style={styles.body}>No hay base para mostrar un cambio semanal.</Text>
      </>
    );
  } else if (metricStateId === 'unavailable') {
    content = (
      <>
        <Text style={styles.body}>La métrica no está disponible. Tu evidencia diaria sigue visible.</Text>
        <Text style={styles.caption}>Puedes continuar sin este dato.</Text>
      </>
    );
  } else {
    content = (
      <>
        <Text style={styles.cardTitle}>{scenario.metric.name}</Text>
        <Text style={styles.body}>
          {first.value} el {first.day} · {last.value} el {last.day} · cambio descriptivo: {delta > 0 ? '+' : ''}{delta} {scenario.metric.unit}
        </Text>
        <Text style={styles.caption}>Dato descriptivo. No explica por qué cambió.</Text>
      </>
    );
  }

  return (
    <Card alert={metricStateId === 'unavailable'}>
      <SectionLabel>MÉTRICA OPCIONAL</SectionLabel>
      {content}
    </Card>
  );
}

function EvidenceSummary({ evidence }) {
  const recorded = evidence.filter((item) => item.state !== 'sin registro').length;
  const counts = evidence.reduce((totals, item) => {
    totals[item.state] = (totals[item.state] || 0) + 1;
    return totals;
  }, {});
  const detail = ['completa', 'mínima', 'sin registro']
    .filter((state) => counts[state])
    .map((state) => `${counts[state]} ${state}`)
    .join(' · ');

  return (
    <>
      <Text style={styles.cardTitle}>{recorded} de {evidence.length} días programados con evidencia</Text>
      <Text style={styles.body}>{detail}</Text>
    </>
  );
}

function StepOne({ session, scenario, onChange, onExit }) {
  const source = getSourceCommitment(session, scenario);

  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <StepHeader
        backLabel="Salir"
        eyebrow="REVISIÓN SEMANAL"
        onBack={onExit}
        step={1}
        title="Decide con evidencia"
      />
      <Text style={styles.dateLine}>{scenario.weekLabel} · {scenario.timezone}</Text>
      <Text style={styles.statusPill}>Semana cerrada · Lista para revisar</Text>

      <Card>
        <SectionLabel>IDENTIDAD ELEGIDA</SectionLabel>
        <Text style={styles.cardTitle}>{scenario.identity}</Text>
        <View style={styles.divider} />
        <SectionLabel>META</SectionLabel>
        <Text style={styles.body}>{scenario.goal}</Text>
      </Card>

      <Card>
        <SectionLabel>EVIDENCIA DE LA SEMANA</SectionLabel>
        <EvidenceSummary evidence={scenario.commitment.evidence} />
        <View style={styles.divider} />
        <Text style={styles.cardTitle}>{source.name}</Text>
        {scenario.commitment.evidence.map((item) => (
          <Text key={item.day} style={styles.body}>{item.day}: {item.state}</Text>
        ))}
      </Card>

      <MetricCard metricStateId={session.config.metricStateId} scenario={scenario} />

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>REFLEXIÓN BREVE · OPCIONAL</SectionLabel>
        <Text style={styles.body}>Selecciona una frase ficticia o continúa sin elegir ninguna.</Text>
        {REFLECTION_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.id}
            label={option.label}
            onPress={() => onChange({ ...session, reflection: option.label })}
            selected={session.reflection === option.label}
          />
        ))}
        {session.reflection ? (
          <SecondaryButton onPress={() => onChange({ ...session, reflection: '' })}>
            Dejar reflexión vacía
          </SecondaryButton>
        ) : null}
      </View>

      <PrimaryButton onPress={() => onChange({ ...session, screen: 'step2' })}>
        Elegir siguiente paso
      </PrimaryButton>
    </ScrollView>
  );
}

function StepTwo({ session, scenario, onChange }) {
  const source = getSourceCommitment(session, scenario);
  const ready = session.targetId === source.id && Boolean(session.decision);

  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <StepHeader
        backLabel="Semana"
        eyebrow="REVISIÓN SEMANAL"
        onBack={() => onChange({ ...session, screen: 'step1' })}
        step={2}
        title="Elige un siguiente paso"
      />

      {session.reloadedConflictSummary ? (
        <Card alert>
          <SectionLabel>DATOS RECARGADOS · VERSIÓN {source.sourceVersion}</SectionLabel>
          <Text style={styles.body}>{session.reloadedConflictSummary}</Text>
          <Text style={styles.body}>Acción mínima actual: {source.minimumAction}</Text>
          <Text style={styles.body}>Días actuales: {dayLabels(source.scheduledDays).join(' · ')}</Text>
          <Text style={styles.warningText}>La decisión anterior se descartó. Elige nuevamente.</Text>
        </Card>
      ) : null}

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>¿SOBRE QUÉ COMPROMISO DECIDIRÁS?</SectionLabel>
        <ChoiceCard
          description={`Fuente v${source.sourceVersion} · Mínima: ${source.minimumAction}`}
          label={source.name}
          onPress={() => onChange({ ...session, targetId: source.id })}
          selected={session.targetId === source.id}
        />
      </View>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionLabel>¿QUÉ HARÁS CON ESTE COMPROMISO?</SectionLabel>
        {DECISIONS.map((decision) => (
          <ChoiceCard
            description={decision.description}
            key={decision.id}
            label={decision.label}
            onPress={() => onChange(resetForDecision(session, decision.id, scenario))}
            selected={session.decision === decision.id}
          />
        ))}
      </View>

      {!ready ? (
        <Text accessibilityLiveRegion="polite" style={styles.helper}>
          Selecciona un compromiso y una decisión para continuar.
        </Text>
      ) : null}
      <PrimaryButton
        disabled={!ready}
        onPress={() => onChange({ ...session, screen: 'step3' })}
      >
        Continuar
      </PrimaryButton>
    </ScrollView>
  );
}

function DayChip({ day, selected, disabled, onPress }) {
  return (
    <Pressable
      accessibilityLabel={day.label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayChip,
        selected && styles.dayChipSelected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>{day.label}</Text>
    </Pressable>
  );
}

function DayEditor({ label, selectedDays, onToggle, disabledDayIds = [] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.dayGrid}>
        {DAYS.map((day) => (
          <DayChip
            day={day}
            disabled={disabledDayIds.includes(day.id)}
            key={day.id}
            onPress={() => onToggle(day.id)}
            selected={selectedDays.includes(day.id)}
          />
        ))}
      </View>
    </View>
  );
}

function BranchEditor({ session, scenario, onChange }) {
  const source = getSourceCommitment(session, scenario);

  if (session.decision === 'keep') {
    return (
      <Card>
        <SectionLabel>SIN CAMBIOS</SectionLabel>
        <Text style={styles.body}>No se crea una configuración duplicada.</Text>
      </Card>
    );
  }

  if (session.decision === 'reduce') {
    const editSchedule = session.reduceMode === 'schedule' || session.reduceMode === 'both';
    const editMinimum = session.reduceMode === 'minimum_action' || session.reduceMode === 'both';

    return (
      <Card>
        <SectionLabel>DEFINE QUÉ REDUCIRÁS</SectionLabel>
        <View accessibilityRole="radiogroup" style={styles.section}>
          {REDUCE_MODES.map((mode) => (
            <ChoiceCard
              description={mode.description}
              key={mode.id}
              label={mode.label}
              onPress={() => onChange(resetForReduceMode(session, mode.id, scenario))}
              selected={session.reduceMode === mode.id}
            />
          ))}
        </View>
        {editSchedule ? (
          <>
            <Text style={styles.body}>Conserva al menos un día. Pausar queda fuera de este prototipo.</Text>
            <DayEditor
              disabledDayIds={DAYS.filter((day) => !source.scheduledDays.includes(day.id)).map((day) => day.id)}
              label="Días desde la fecha efectiva"
              onToggle={(dayId) => onChange({ ...session, afterDays: toggleDay(session.afterDays, dayId) })}
              selectedDays={session.afterDays}
            />
          </>
        ) : null}
        {editMinimum ? (
          <View accessibilityRole="radiogroup" style={styles.section}>
            <Text style={styles.fieldLabel}>Elige una acción mínima ficticia más pequeña</Text>
            <Text style={styles.body}>Tú interpretas la diferencia; HEXIS no infiere su significado.</Text>
            {scenario.reducedMinimumActions.map((minimumAction) => (
              <ChoiceCard
                key={minimumAction}
                label={minimumAction}
                onPress={() => onChange({ ...session, afterMinimumAction: minimumAction })}
                selected={session.afterMinimumAction === minimumAction}
              />
            ))}
            <Text style={styles.caption}>Actual: {source.minimumAction}</Text>
          </View>
        ) : null}
      </Card>
    );
  }

  if (session.decision === 'increase') {
    return (
      <Card>
        <SectionLabel>ELIGE DÍAS ADICIONALES</SectionLabel>
        <Text style={styles.body}>HEXIS no interpreta la métrica como una recomendación.</Text>
        <DayEditor
          disabledDayIds={source.scheduledDays}
          label="Días desde la fecha efectiva"
          onToggle={(dayId) => onChange({ ...session, afterDays: toggleDay(session.afterDays, dayId) })}
          selectedDays={session.afterDays}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>ELIGE UN COMPROMISO FICTICIO</SectionLabel>
      <Text style={styles.body}>Las opciones están congeladas para impedir la entrada de datos personales.</Text>
      <View accessibilityRole="radiogroup" style={styles.section}>
        {scenario.replacementOptions.map((option) => (
          <ChoiceCard
            description={`Acción mínima: ${option.minimumAction} · Días: ${dayLabels(option.scheduledDays).join(' · ')}`}
            key={option.id}
            label={option.name}
            onPress={() => onChange({
              ...session,
              replacement: {
                fixtureId: option.id,
                name: option.name,
                minimumAction: option.minimumAction,
                scheduledDays: [...option.scheduledDays],
              },
            })}
            selected={session.replacement.fixtureId === option.id}
          />
        ))}
      </View>
    </Card>
  );
}

function PreviewCard({ session, scenario }) {
  const source = getSourceCommitment(session, scenario);
  const after = buildAfterCommitment(session, scenario);
  const beforeDays = dayLabels(source.scheduledDays).join(' · ');
  const afterTitle = after.name || 'Nuevo compromiso sin nombre';
  const afterMinimumAction = after.minimumAction || 'Completa una acción mínima';
  const afterDays = dayLabels(after.scheduledDays).join(' · ') || 'Elige al menos un día';
  const nextSummary = `Vista previa D más uno. Desde el ${session.effectiveDate.full}: ${afterTitle}. Acción mínima: ${afterMinimumAction}. Días: ${afterDays}. La evidencia anterior permanece. Zona del plan: ${scenario.timezone}.`;
  const [announcement, setAnnouncement] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(nextSummary), 650);
    return () => clearTimeout(timer);
  }, [nextSummary]);

  return (
    <Card>
      <SectionLabel>PREVIEW D+1</SectionLabel>
      <Text style={styles.previewLabel}>Hasta el {session.reviewThroughDate.full}</Text>
      <Text style={styles.cardTitle}>{source.name}</Text>
      <Text style={styles.body}>Acción mínima: {source.minimumAction}</Text>
      <Text style={styles.body}>Días: {beforeDays}</Text>
      <View style={styles.divider} />
      <Text style={styles.previewLabel}>Desde el {session.effectiveDate.full}</Text>
      <Text style={styles.cardTitle}>{afterTitle}</Text>
      <Text style={styles.body}>Acción mínima: {afterMinimumAction}</Text>
      <Text style={styles.body}>Días: {afterDays}</Text>
      <Text style={styles.historyText}>Tu evidencia anterior permanece.</Text>
      <Text style={styles.caption}>Zona del plan: {scenario.timezone}</Text>
      {announcement ? (
        <Text accessibilityLiveRegion="polite" style={styles.accessibleStatus}>{announcement}</Text>
      ) : null}
    </Card>
  );
}

function StepThree({ session, scenario, onChange }) {
  const valid = isDraftValid(session, scenario);
  const decision = DECISIONS.find((item) => item.id === session.decision);
  const source = getSourceCommitment(session, scenario);

  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <StepHeader
        backLabel="Decisión"
        eyebrow={`${source.name} · ${decision ? decision.label : 'Decisión inválida'}`}
        onBack={() => onChange({ ...session, screen: 'step2', confirmationStatus: 'idle' })}
        step={3}
        title={session.decision === 'keep' ? 'Revisa tu decisión' : 'Prepara el cambio'}
      />

      <BranchEditor onChange={onChange} scenario={scenario} session={session} />
      <PreviewCard scenario={scenario} session={session} />

      {!valid ? (
        <Text accessibilityLiveRegion="polite" style={styles.helper}>
          Completa una diferencia válida para revisar la confirmación.
        </Text>
      ) : null}
      <PrimaryButton
        disabled={!valid}
        onPress={() => onChange({ ...session, screen: 'confirmation', confirmationStatus: 'idle' })}
      >
        Revisar y confirmar
      </PrimaryButton>
    </ScrollView>
  );
}

function ConfirmationError({ session, scenario, onChange }) {
  const titleRef = React.useRef(null);
  const source = getSourceCommitment(session, scenario);

  React.useEffect(() => {
    if (session.confirmationStatus === 'idle') return undefined;
    const timer = setTimeout(() => {
      const handle = findNodeHandle(titleRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 120);
    return () => clearTimeout(timer);
  }, [session.confirmationStatus]);

  if (session.confirmationStatus === 'offline') {
    return (
      <Card alert>
        <Text ref={titleRef} accessibilityRole="header" style={styles.errorTitle}>No pudimos confirmar</Text>
        <Text style={styles.body}>Tu selección sigue aquí. Ningún cambio real salió de este prototipo.</Text>
        <PrimaryButton onPress={() => onChange(attemptConfirmation(session, scenario))}>
          Simular conexión restablecida y reintentar
        </PrimaryButton>
      </Card>
    );
  }

  if (session.confirmationStatus === 'conflict') {
    const pending = session.pendingConflictSource;
    return (
      <Card alert>
        <Text ref={titleRef} accessibilityRole="header" style={styles.errorTitle}>{source.name} cambió desde que abriste la Revisión</Text>
        <Text style={styles.body}>Fuente abierta: v{source.sourceVersion}. Fuente disponible: v{pending ? pending.sourceVersion : '?' }.</Text>
        <Text style={styles.body}>{scenario.conflictUpdate.summary}</Text>
        <Text style={styles.body}>Recarga el escenario y reconstruye la decisión antes de confirmar.</Text>
        <PrimaryButton onPress={() => onChange(rebuildAfterConflict(session, scenario))}>
          Recargar datos sintéticos
        </PrimaryButton>
      </Card>
    );
  }

  if (session.confirmationStatus === 'rollover') {
    return (
      <Card alert>
        <Text ref={titleRef} accessibilityRole="header" style={styles.errorTitle}>La fecha cambió</Text>
        <Text style={styles.body}>
          La revisión ahora llega hasta el {session.reviewThroughDate.full} y el ajuste inicia el {session.effectiveDate.full}. Revísalo antes de confirmar.
        </Text>
        <PrimaryButton onPress={() => onChange(acknowledgeRollover(session, scenario))}>
          Revisar fecha actualizada
        </PrimaryButton>
      </Card>
    );
  }

  if (session.confirmationStatus === 'invalid') {
    return (
      <Card alert>
        <Text ref={titleRef} accessibilityRole="header" style={styles.errorTitle}>El borrador necesita revisión</Text>
        <Text style={styles.body}>Vuelve al paso anterior y completa una diferencia válida.</Text>
        <PrimaryButton onPress={() => onChange({ ...session, screen: 'step3', confirmationStatus: 'idle' })}>
          Volver a editar
        </PrimaryButton>
      </Card>
    );
  }

  return null;
}

function Confirmation({ session, scenario, onChange }) {
  const decision = DECISIONS.find((item) => item.id === session.decision);
  const source = getSourceCommitment(session, scenario);
  const hasError = session.confirmationStatus !== 'idle';

  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Text style={styles.eyebrow}>REVISIÓN SEMANAL</Text>
      <Text accessibilityRole="header" style={styles.title}>Confirma tu decisión</Text>
      <Card>
        <Text style={styles.summaryRow}>Semana revisada: {scenario.weekLabel}</Text>
        <Text style={styles.summaryRow}>Compromiso: {source.name} · fuente v{source.sourceVersion}</Text>
        <Text style={styles.summaryRow}>Decisión: {decision ? decision.label : 'Inválida'}</Text>
        <Text style={styles.summaryRow}>Cambio: {describeChange(session, scenario)}</Text>
        <Text style={styles.summaryRow}>
          {session.decision === 'keep' ? 'Continúa desde' : 'Entra en vigor'}: {session.effectiveDate.full}
        </Text>
        <Text style={styles.summaryRow}>Zona del plan: {scenario.timezone}</Text>
        <Text style={styles.summaryRow}>Historia anterior: se conserva</Text>
      </Card>

      <ConfirmationError onChange={onChange} scenario={scenario} session={session} />

      {!hasError ? (
        <>
          <SecondaryButton onPress={() => onChange({ ...session, screen: 'step3' })}>
            Volver a editar
          </SecondaryButton>
          <PrimaryButton onPress={() => onChange(attemptConfirmation(session, scenario))}>
            {session.decision === 'keep'
              ? 'Guardar revisión sin cambiar configuración'
              : 'Guardar revisión y preparar cambio'}
          </PrimaryButton>
        </>
      ) : null}
    </ScrollView>
  );
}

function Receipt({ session, scenario, onFinish }) {
  const titleRef = React.useRef(null);
  const source = getSourceCommitment(session, scenario);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const handle = findNodeHandle(titleRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.screenContent, styles.receiptContent]}>
      <Text ref={titleRef} accessibilityRole="header" style={styles.title}>
        Revisión simulada confirmada
      </Text>
      <Card>
        {session.decision === 'keep' ? (
          <Text style={styles.cardTitle}>{source.name} continúa sin cambios.</Text>
        ) : (
          <Text style={styles.cardTitle}>
            El cambio de {source.name} entra en vigor el {session.effectiveDate.full}.
          </Text>
        )}
        <Text style={styles.body}>{describeChange(session, scenario)}</Text>
        <Text style={styles.historyText}>Tu evidencia anterior permanece.</Text>
        <Text style={styles.caption}>Zona del plan: {scenario.timezone}</Text>
      </Card>
      <Card>
        <SectionLabel>LÍMITE DEL ARTEFACTO</SectionLabel>
        <Text style={styles.body}>
          Esta confirmación existe solo en memoria con datos sintéticos. No se guardó ni cambió una configuración real.
        </Text>
      </Card>
      <PrimaryButton onPress={onFinish}>Preparar otro recorrido interno</PrimaryButton>
    </ScrollView>
  );
}

function FlowStateError({ onFinish }) {
  return (
    <View style={styles.screenContent}>
      <Text accessibilityRole="header" style={styles.title}>La sesión local no es válida</Text>
      <Card alert>
        <Text style={styles.body}>No se mostrará un recibo sin una confirmación válida.</Text>
        <PrimaryButton onPress={onFinish}>Volver a preparación</PrimaryButton>
      </Card>
    </View>
  );
}

function ParticipantFlow({ initialConfig, onFinish }) {
  const [session, setSession] = React.useState(() => createSession(initialConfig));
  const scenario = session && session.config
    ? SCENARIOS[session.config.scenarioKey]
    : null;

  if (!scenario || !isSessionEnvelopeTrusted(session, scenario)) {
    return <FlowStateError onFinish={onFinish} />;
  }

  if (session.screen === 'step1') {
    return <StepOne onChange={setSession} onExit={onFinish} scenario={scenario} session={session} />;
  }
  if (session.screen === 'step2') {
    return <StepTwo onChange={setSession} scenario={scenario} session={session} />;
  }
  if (session.screen === 'step3') {
    return <StepThree onChange={setSession} scenario={scenario} session={session} />;
  }
  if (session.screen === 'confirmation') {
    return <Confirmation onChange={setSession} scenario={scenario} session={session} />;
  }
  if (canShowReceipt(session, scenario)) {
    return <Receipt onFinish={onFinish} scenario={scenario} session={session} />;
  }
  return <FlowStateError onFinish={onFinish} />;
}

function App() {
  const [teamConfig, setTeamConfig] = React.useState(DEFAULT_TEAM_CONFIG);
  const [sessionKey, setSessionKey] = React.useState(null);

  const start = () => setSessionKey((value) => (value === null ? 1 : value + 1));
  const finish = () => {
    setSessionKey(null);
    setTeamConfig({ ...DEFAULT_TEAM_CONFIG });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor={colors.background} barStyle="light-content" />
      <View style={styles.flex}>
        {sessionKey === null ? (
          <TeamSetup config={teamConfig} onChange={setTeamConfig} onStart={start} />
        ) : (
          <ParticipantFlow initialConfig={teamConfig} key={sessionKey} onFinish={finish} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  screenContent: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  receiptContent: { flexGrow: 1, justifyContent: 'center' },
  headerBlock: { gap: 8 },
  headerRow: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backButton: { minHeight: 48, justifyContent: 'center', paddingRight: 12 },
  backButtonText: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  stepText: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 32, lineHeight: 39, fontWeight: '800' },
  lead: { color: colors.muted, fontSize: 18, lineHeight: 27 },
  dateLine: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  statusPill: {
    alignSelf: 'flex-start',
    color: colors.accent,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  teamBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  teamBadgeText: { color: '#271900', fontWeight: '900', fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 10,
  },
  alertCard: { borderColor: colors.error, backgroundColor: colors.errorSurface },
  section: { gap: 10 },
  sectionLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '750' },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
  caption: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  warningText: { color: colors.warning, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  errorTitle: { color: colors.error, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  choice: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  choiceText: { flex: 1, gap: 3 },
  choiceLabel: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: '750' },
  choiceDescription: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: colors.accent },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#435256' },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '850',
    textAlign: 'center',
  },
  primaryButtonTextDisabled: { color: '#D5DCDD' },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.accent, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.58 },
  helper: { color: colors.warning, fontSize: 15, lineHeight: 22 },
  fieldLabel: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    minHeight: 48,
    minWidth: 92,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayChipText: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  dayChipTextSelected: { color: colors.accentText },
  previewLabel: { color: colors.warning, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  accessibleStatus: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  historyText: { color: colors.accent, fontSize: 16, lineHeight: 24, fontWeight: '800', marginTop: 4 },
  summaryRow: { color: colors.text, fontSize: 16, lineHeight: 25 },
  mono: {
    color: colors.muted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 20,
  },
});

module.exports = App;
