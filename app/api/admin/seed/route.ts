import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/admin/seed — Create realistic test data for anasolanob07@gmail.com
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()

    // 1. Find the doctor by email
    const { data: doctorProfile } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('email', 'anasolanob07@gmail.com')
      .single()

    if (!doctorProfile) {
      // Try via auth
      const { data: { users } } = await admin.auth.admin.listUsers()
      const doctorUser = users?.find(u => u.email === 'anasolanob07@gmail.com')
      if (!doctorUser) {
        return NextResponse.json({ error: 'Doctor anasolanob07@gmail.com no encontrado' }, { status: 404 })
      }
    }

    const doctorId = doctorProfile?.id
    if (!doctorId) {
      return NextResponse.json({ error: 'No se encontró el perfil del doctor' }, { status: 404 })
    }

    // 2. Delete existing appointments and consultations for this doctor
    await admin.from('consultations').delete().eq('doctor_id', doctorId)
    await admin.from('appointments').delete().eq('doctor_id', doctorId)

    // 3. Create realistic patients
    const patientData = [
      { full_name: 'María Elena Rodríguez', phone: '0414-555-1234', email: 'maria.rodriguez@gmail.com', cedula: 'V-18234567', source: 'booking', age: 34, sex: 'female', blood_type: 'O+', allergies: 'Penicilina', chronic_conditions: null },
      { full_name: 'José Antonio Pérez', phone: '0412-555-5678', email: 'jose.perez@gmail.com', cedula: 'V-15678901', source: 'booking', age: 52, sex: 'male', blood_type: 'A+', allergies: null, chronic_conditions: 'Hipertensión arterial' },
      { full_name: 'Ana Gabriela Martínez', phone: '0416-555-9012', email: 'ana.martinez@gmail.com', cedula: 'V-20345678', source: 'referral', age: 28, sex: 'female', blood_type: 'B+', allergies: 'Ibuprofeno, Mariscos', chronic_conditions: null },
      { full_name: 'Carlos Eduardo López', phone: '0424-555-3456', email: 'carlos.lopez@gmail.com', cedula: 'V-12890123', source: 'booking', age: 45, sex: 'male', blood_type: 'AB+', allergies: null, chronic_conditions: 'Diabetes tipo 2, Dislipidemia' },
      { full_name: 'Pedro José San María', phone: '0414-555-7890', email: 'pedro.sanmaria@gmail.com', cedula: 'V-19567890', source: 'booking', age: 38, sex: 'male', blood_type: 'O-', allergies: 'Sulfonamidas', chronic_conditions: null },
      { full_name: 'Luisa Fernanda Torres', phone: '0412-555-2345', email: 'luisa.torres@gmail.com', cedula: 'V-21678901', source: 'walk-in', age: 62, sex: 'female', blood_type: 'A-', allergies: null, chronic_conditions: 'Artritis reumatoide, Hipotiroidismo' },
    ]

    // Delete old patients for this doctor first (except those with auth_user_id)
    await admin.from('patients').delete().eq('doctor_id', doctorId).is('auth_user_id', null)

    const createdPatients: { id: string; full_name: string }[] = []
    for (const p of patientData) {
      // Check if patient already exists
      const { data: existing } = await admin
        .from('patients')
        .select('id, full_name')
        .eq('doctor_id', doctorId)
        .eq('cedula', p.cedula)
        .maybeSingle()

      if (existing) {
        createdPatients.push(existing)
        // Update the patient data
        await admin.from('patients').update({
          full_name: p.full_name,
          phone: p.phone,
          email: p.email,
          age: p.age,
          sex: p.sex,
          blood_type: p.blood_type,
          allergies: p.allergies,
          chronic_conditions: p.chronic_conditions,
        }).eq('id', existing.id)
      } else {
        const { data: newPatient } = await admin
          .from('patients')
          .insert({ doctor_id: doctorId, ...p })
          .select('id, full_name')
          .single()
        if (newPatient) createdPatients.push(newPatient)
      }
    }

    // 4. Create appointments and consultations with realistic data
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Helper to create dates
    const daysAgo = (n: number, hour: number, min: number = 0) => {
      const d = new Date(today)
      d.setDate(d.getDate() - n)
      d.setHours(hour, min, 0, 0)
      return d.toISOString()
    }
    const daysFromNow = (n: number, hour: number, min: number = 0) => {
      const d = new Date(today)
      d.setDate(d.getDate() + n)
      d.setHours(hour, min, 0, 0)
      return d.toISOString()
    }
    const todayAt = (hour: number, min: number = 0) => {
      const d = new Date(today)
      d.setHours(hour, min, 0, 0)
      return d.toISOString()
    }

    // Generate consultation codes
    let codeCounter = 1
    const nextCode = () => `CON-${String(codeCounter++).padStart(4, '0')}`

    // PAST CONSULTATIONS (completed, with full reports)
    const pastConsultations = [
      {
        patient: createdPatients[0], // María Elena Rodríguez
        date: daysAgo(14, 9, 0),
        chief_complaint: 'Dolor de cabeza frecuente desde hace 2 semanas',
        notes: '<p>Paciente femenina de 34 años que acude por <strong>cefalea tensional recurrente</strong> de 2 semanas de evolución. Refiere dolor tipo opresivo, bilateral, de intensidad moderada (EVA 6/10). Se agrava con el estrés laboral y mejora parcialmente con paracetamol.</p><p><strong>Examen físico:</strong> TA: 120/80 mmHg, FC: 72 lpm. Pares craneales sin alteración. Fondo de ojo normal. Puntos gatillo cervicales positivos bilateral.</p><p><strong>Antecedentes:</strong> Alergia a penicilina. Sin otros antecedentes de importancia.</p>',
        diagnosis: '<p><strong>Diagnóstico principal:</strong> Cefalea tensional episódica (G44.2)</p><p><strong>Diagnósticos diferenciales descartados:</strong></p><ul><li>Migraña sin aura</li><li>Cefalea cervicogénica</li></ul>',
        treatment: '<p><strong>Plan de tratamiento:</strong></p><ol><li>Ibuprofeno 400mg cada 8 horas por 5 días (con protección gástrica)</li><li>Técnicas de relajación y manejo del estrés</li><li>Higiene del sueño: dormir mínimo 7 horas</li><li>Control en 2 semanas</li></ol><p><em>Nota: Se indica ibuprofeno con precaución por alergia a penicilina (sin relación cruzada confirmada).</em></p>',
        payment_status: 'approved',
        plan_name: 'Consulta General',
        plan_price: 20,
        payment_method: 'pago_movil',
        status: 'completed',
      },
      {
        patient: createdPatients[1], // José Antonio Pérez
        date: daysAgo(10, 10, 30),
        chief_complaint: 'Control de hipertensión arterial',
        notes: '<p>Paciente masculino de 52 años con <strong>hipertensión arterial</strong> diagnosticada hace 5 años. Acude para control rutinario. Refiere cumplimiento adecuado del tratamiento con Losartán 50mg/día.</p><p><strong>Examen físico:</strong> TA: 140/90 mmHg (ligeramente elevada), FC: 68 lpm, Peso: 85 kg, Talla: 1.72m, IMC: 28.7 (sobrepeso).</p><p>Resto del examen sin particularidades. Edema maleolar leve bilateral.</p>',
        diagnosis: '<p><strong>Diagnóstico:</strong> Hipertensión arterial esencial grado I, parcialmente controlada (I10)</p><p>Sobrepeso (E66.0)</p>',
        treatment: '<p><strong>Ajuste terapéutico:</strong></p><ol><li>Aumentar Losartán a 100mg/día</li><li>Agregar Amlodipino 5mg/día</li><li>Dieta hiposódica estricta</li><li>Caminata 30 min/día, 5 días/semana</li><li>Meta: pérdida de 5kg en 3 meses</li><li>Laboratorio: perfil lipídico, glicemia, creatinina, electrolitos</li><li>Control en 4 semanas con resultados de laboratorio</li></ol>',
        payment_status: 'approved',
        plan_name: 'Control Especializado',
        plan_price: 35,
        payment_method: 'transferencia',
        status: 'completed',
      },
      {
        patient: createdPatients[2], // Ana Gabriela Martínez
        date: daysAgo(7, 11, 0),
        chief_complaint: 'Erupción cutánea en brazos y cuello',
        notes: '<p>Paciente femenina de 28 años que consulta por <strong>erupción eritematosa pruriginosa</strong> en ambos brazos y cuello de 5 días de evolución. Niega fiebre. Refiere haber iniciado nuevo detergente para ropa hace 1 semana.</p><p><strong>Examen físico:</strong> Placas eritematosas, edematosas, con vesículas pequeñas en superficie extensora de ambos brazos y región cervical anterior. No adenopatías palpables.</p>',
        diagnosis: '<p><strong>Diagnóstico:</strong> Dermatitis de contacto alérgica (L23.9)</p><p>Probable agente causal: detergente nuevo</p>',
        treatment: '<p><strong>Indicaciones:</strong></p><ol><li>Suspender uso del detergente nuevo inmediatamente</li><li>Loratadina 10mg/día por 7 días</li><li>Betametasona crema 0.05% aplicar 2 veces/día en lesiones por 5 días</li><li>Emoliente (crema hidratante) 3 veces/día</li><li>Evitar rascado</li><li>Control en 1 semana si no mejora</li></ol>',
        payment_status: 'approved',
        plan_name: 'Consulta General',
        plan_price: 20,
        payment_method: 'efectivo',
        status: 'completed',
      },
      {
        patient: createdPatients[3], // Carlos Eduardo López
        date: daysAgo(5, 8, 30),
        chief_complaint: 'Control de diabetes y revisión de laboratorios',
        notes: '<p>Paciente masculino de 45 años con <strong>diabetes mellitus tipo 2</strong> y <strong>dislipidemia</strong> diagnosticadas hace 3 años. Trae resultados de laboratorio:</p><ul><li>Glicemia en ayunas: 145 mg/dL (elevada)</li><li>HbA1c: 7.8% (meta < 7%)</li><li>Colesterol total: 240 mg/dL</li><li>LDL: 160 mg/dL</li><li>HDL: 38 mg/dL</li><li>Triglicéridos: 210 mg/dL</li></ul><p>Tratamiento actual: Metformina 850mg c/12h, Atorvastatina 20mg/noche.</p>',
        diagnosis: '<p><strong>Diagnósticos:</strong></p><ul><li>Diabetes mellitus tipo 2 con control subóptimo (E11.65)</li><li>Dislipidemia mixta no controlada (E78.2)</li><li>Riesgo cardiovascular moderado-alto</li></ul>',
        treatment: '<p><strong>Ajustes al tratamiento:</strong></p><ol><li>Mantener Metformina 850mg c/12h</li><li>Agregar Glimepirida 2mg antes del desayuno</li><li>Aumentar Atorvastatina a 40mg/noche</li><li>Dieta diabética estricta: eliminar azúcares refinados, reducir carbohidratos</li><li>Ejercicio aeróbico 150 min/semana</li><li>Automonitoreo de glicemia 2 veces/día</li><li>Repetir laboratorio en 3 meses</li><li>Referir a Nutrición y Oftalmología (fondo de ojo diabético anual)</li></ol>',
        payment_status: 'approved',
        plan_name: 'Control Especializado',
        plan_price: 35,
        payment_method: 'zelle',
        status: 'completed',
      },
      {
        patient: createdPatients[5], // Luisa Fernanda Torres
        date: daysAgo(3, 14, 0),
        chief_complaint: 'Dolor articular en manos, rigidez matutina',
        notes: '<p>Paciente femenina de 62 años con antecedente de <strong>artritis reumatoide</strong> e <strong>hipotiroidismo</strong>. Consulta por exacerbación de dolor en articulaciones metacarpofalángicas e interfalángicas proximales bilateral. Rigidez matutina de >1 hora.</p><p><strong>Tratamiento actual:</strong> Metotrexato 15mg/semana + Ácido fólico 5mg/semana, Levotiroxina 75mcg/día.</p><p><strong>Examen físico:</strong> Articulaciones MCF e IFP con edema y dolor a la palpación bilateral. Nódulos de Bouchard presentes. DAS28: 4.2 (actividad moderada).</p><p><strong>Laboratorio reciente:</strong> TSH: 3.2 mUI/L (normal), VSG: 45 mm/h (elevada), PCR: 12 mg/L (elevada).</p>',
        diagnosis: '<p><strong>Diagnóstico:</strong> Artritis reumatoide con actividad moderada (M06.0)</p><p>Hipotiroidismo controlado (E03.9)</p>',
        treatment: '<p><strong>Plan:</strong></p><ol><li>Aumentar Metotrexato a 20mg/semana (vía oral)</li><li>Mantener Ácido fólico 5mg al día siguiente del metotrexato</li><li>Prednisona 10mg/día por 2 semanas, luego reducir a 5mg/día por 2 semanas más</li><li>Mantener Levotiroxina 75mcg/día</li><li>Solicitar: hemograma, función hepática, función renal (por metotrexato)</li><li>Control en 4 semanas con laboratorio</li><li>Fisioterapia para manos: parafina + ejercicios de rango de movimiento</li></ol>',
        payment_status: 'approved',
        plan_name: 'Consulta Especializada',
        plan_price: 40,
        payment_method: 'pago_movil',
        status: 'completed',
      },
    ]

    // TODAY'S APPOINTMENTS
    const todayAppointments = [
      {
        patient: createdPatients[4], // Pedro José San María
        date: todayAt(10, 0),
        chief_complaint: 'Dolor abdominal recurrente',
        plan_name: 'Consulta General',
        plan_price: 20,
        payment_method: 'pago_movil',
        payment_receipt_url: 'https://azsismbgfanszkygzwaz.supabase.co/storage/v1/object/public/payment-receipts/sample-receipt-pedro.jpg',
        status: 'scheduled',
      },
      {
        patient: createdPatients[0], // María Elena Rodríguez (follow-up)
        date: todayAt(11, 0),
        chief_complaint: 'Control de cefalea - seguimiento',
        plan_name: 'Consulta General',
        plan_price: 20,
        payment_method: 'transferencia',
        payment_receipt_url: null,
        status: 'confirmed',
      },
    ]

    // FUTURE APPOINTMENTS
    const futureAppointments = [
      {
        patient: createdPatients[1], // José Antonio Pérez
        date: daysFromNow(3, 9, 0),
        chief_complaint: 'Control con resultados de laboratorio',
        plan_name: 'Control Especializado',
        plan_price: 35,
        payment_method: 'zelle',
        status: 'scheduled',
      },
      {
        patient: createdPatients[3], // Carlos Eduardo López
        date: daysFromNow(7, 10, 30),
        chief_complaint: 'Control de diabetes - seguimiento',
        plan_name: 'Control Especializado',
        plan_price: 35,
        payment_method: 'pago_movil',
        status: 'scheduled',
      },
      {
        patient: createdPatients[5], // Luisa Fernanda Torres
        date: daysFromNow(14, 14, 0),
        chief_complaint: 'Control de artritis con laboratorio',
        plan_name: 'Consulta Especializada',
        plan_price: 40,
        payment_method: 'transferencia',
        status: 'scheduled',
      },
    ]

    // Insert past consultations
    const insertedConsultations = []
    for (const c of pastConsultations) {
      const code = nextCode()

      // Create consultation
      const { data: consultation, error: consErr } = await admin
        .from('consultations')
        .insert({
          doctor_id: doctorId,
          patient_id: c.patient.id,
          consultation_code: code,
          consultation_date: c.date,
          chief_complaint: c.chief_complaint,
          notes: c.notes,
          diagnosis: c.diagnosis,
          treatment: c.treatment,
          payment_status: c.payment_status,
        })
        .select('id')
        .single()

      if (consErr) {
        console.warn('Error creating consultation:', consErr.message)
        continue
      }

      // Create matching appointment
      await admin.from('appointments').insert({
        doctor_id: doctorId,
        patient_id: c.patient.id,
        patient_name: c.patient.full_name,
        scheduled_at: c.date,
        status: c.status,
        source: 'booking',
        chief_complaint: c.chief_complaint,
        plan_name: c.plan_name,
        plan_price: c.plan_price,
        payment_method: c.payment_method,
      })

      insertedConsultations.push({ code, patient: c.patient.full_name })
    }

    // Insert today's appointments
    for (const a of todayAppointments) {
      await admin.from('appointments').insert({
        doctor_id: doctorId,
        patient_id: a.patient.id,
        patient_name: a.patient.full_name,
        scheduled_at: a.date,
        status: a.status,
        source: 'booking',
        chief_complaint: a.chief_complaint,
        plan_name: a.plan_name,
        plan_price: a.plan_price,
        payment_method: a.payment_method,
        payment_receipt_url: a.payment_receipt_url,
      })
    }

    // Insert future appointments
    for (const a of futureAppointments) {
      await admin.from('appointments').insert({
        doctor_id: doctorId,
        patient_id: a.patient.id,
        patient_name: a.patient.full_name,
        scheduled_at: a.date,
        status: a.status,
        source: 'booking',
        chief_complaint: a.chief_complaint,
        plan_name: a.plan_name,
        plan_price: a.plan_price,
        payment_method: a.payment_method,
      })
    }

    return NextResponse.json({
      success: true,
      doctorId,
      patients: createdPatients.map(p => p.full_name),
      consultations: insertedConsultations,
      todayAppointments: todayAppointments.map(a => `${a.patient.full_name} - ${a.date}`),
      futureAppointments: futureAppointments.map(a => `${a.patient.full_name} - ${a.date}`),
    })
  } catch (err: any) {
    console.error('[API seed] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
