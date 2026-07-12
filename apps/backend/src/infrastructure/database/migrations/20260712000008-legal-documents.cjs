/**
 * Migration: 20260712000008-legal-documents
 *
 * Changes:
 *   1. Creates the `legal_documents` table for storing versioned legal content
 *      (Terms & Conditions, Privacy Policy, etc.) as HTML.
 *
 *   2. Inserts the initial Terms & Conditions document (version '2026-07',
 *      is_current = true) with the full HTML content of the official T&C document.
 *
 *   3. Adds two nullable columns to the `profiles` table:
 *      - terms_accepted_at  TIMESTAMPTZ — when the doctor accepted the T&C.
 *      - terms_accepted_version TEXT     — which version was accepted.
 *
 * down():
 *   Removes the two profile columns and drops the legal_documents table.
 *   All inserted documents are removed via DROP TABLE CASCADE.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

// ---------------------------------------------------------------------------
// T&C HTML content — transcribed faithfully from terminosYCondiciones_delta.pdf
// Dollar-quoting ($html$...$html$) is used in the INSERT to avoid escaping
// conflicts with apostrophes and special characters inside the HTML.
// The JS string uses backtick template literals; single quotes inside are safe.
// ---------------------------------------------------------------------------

const TERMS_HTML = `<h1>Términos y Condiciones</h1>
<p>Bienvenidos a los Términos y Condiciones (en adelante, "Términos") que establecen los derechos y obligaciones entre los Usuarios, específicamente Especialistas en el Área de Salud (en adelante, "Especialistas") de la Aplicación de Planificación de Recursos Empresariales Delta Salud App (en adelante, "Delta Salud"). Al utilizar Delta Salud, los Especialistas aceptan regirse por los siguientes términos:</p>

<h2>CAPÍTULO I. GENERALIDADES DEL SERVICIO</h2>

<h3>Consideraciones Generales:</h3>
<ol>
  <li>Delta Salud actúa como una herramienta de Planificación de Recursos Empresariales (Enterprise Resource Planning, ERP, por sus siglas en inglés), que, mediante la creación de un ecosistema para distintos especialistas en el área de salud, permite la gestión, planificación y atención de consultas médicas, la centralización de historias clínicas de los pacientes y, en general, la optimización de la administración de los servicios médicos y de la administración de los consultorios privados.</li>
  <li>Delta Salud no participa de manera directa en las interacciones entre los Especialistas y sus Pacientes, ni se beneficia económicamente de ningún contrato o transacción derivada de dichas interacciones.</li>
  <li>Los Especialistas son los únicos responsables, de manera enunciativa y no limitativa, de la calidad, seguridad, veracidad y disponibilidad de los servicios ofrecidos, por tanto, Delta Salud no se responsabiliza de manera alguna de la calidad de los resultados de los servicios proporcionados.</li>
  <li>Sin perjuicio de los procesos internos de validación y verificación de credenciales profesionales de los Especialistas, Delta Salud no ejerce control, supervisión, monitoreo ni auditoría continua sobre la práctica profesional, el criterio médico, la gestión financiera ni el uso cotidiano que el Especialista haga de la plataforma. Por lo tanto, Delta Salud no se responsabiliza, de manera alguna, por el uso indebido, negligente, inapropiado o ilícito de las herramientas de software por parte de los Especialistas, así como tampoco por cualquier alteración o incapacidad jurídica sobrevenida que afecte el ejercicio de su profesión, ni por su disposición o posibilidad de ejecutar transacciones o abonar los costes derivados de su actividad.</li>
</ol>

<h3>Definiciones:</h3>
<ol>
  <li><strong>"Cookies"</strong>: fragmentos de texto utilizados para el almacenamiento y recibimiento de identificadores y otros datos en computadoras, teléfonos y otros dispositivos.</li>
  <li><strong>"API"</strong> (Interfaz de Programación de Aplicaciones): es un fee que se paga por el conjunto de reglas y protocolos que permite que diferentes programas se comuniquen y compartan datos entre sí, facilitando la integración de funciones y servicios.</li>
</ol>

<h2>CAPÍTULO II. SEGURIDAD DE DATOS</h2>

<h3>Almacenamiento de forma segura de datos personales.</h3>
<p>A fin de salvaguardar la integridad, confidencialidad y seguridad de los Especialistas, implementamos los siguientes criterios:</p>
<ol>
  <li>Solicitamos el consentimiento explícito del Especialista antes de recopilar cualquier información personal.</li>
  <li>Empleamos bases de datos en reposo (AES-256-GCM) en todos los datos almacenados, protegiendo la información, incluso ante accesos no autorizados.</li>
  <li>Recomendamos evitar el uso de canales inseguros para enviarnos información sensible o confidencial. Para ello, Delta Salud proveerá un espacio seguro para las consultas, dudas y sugerencias.</li>
</ol>

<h3>Acceso autorizado a la información de los Especialistas.</h3>
<p>Para evitar el acceso no autorizado a la información de los Especialistas, aplicamos las siguientes medidas:</p>
<ol>
  <li>Implementamos la autenticación de múltiples factores (MFA) y monitoreo continuo de acceso.</li>
  <li>Empleamos el uso de cookies, etiquetas y otras tecnologías de seguimiento para el recibimiento y almacenamiento datos en computadoras, teléfonos y otros dispositivos, incluyendo: (i) información del dispositivo, como su sistema operativo y dirección de protocolo de internet; (ii) información de ubicación y (iii) cualquier otra información respecto a la interacción del Especialista como el tipo de navegador, modelo del hardware, fichas de fecha y hora, la versión de la aplicación, el nivel de carga de la batería, el idioma y los datos sobre las operaciones de dispositivos e identificadores.</li>
  <li>Realizamos auditorías periódicas como práctica frecuente para evaluar el manejo de datos.</li>
  <li>Proporcionamos al Especialista un portal para acceder, modificar (editar perfil, servicios, horario, gestión de pacientes) y eliminar sus datos fácilmente.</li>
</ol>

<h3>Filtración de datos personales.</h3>
<p>A modo de garantizar la calidad de nuestra herramienta, en Delta Salud la información personal se utiliza con los siguientes fines:</p>
<ol>
  <li>Presentar el currículum, dirección, servicios, métodos de pago, disponibilidad y todos los datos pertinentes a los pacientes.</li>
  <li>Verificar las credenciales ante el Servicio Autónomo de Contraloría Sanitaria (SACS) del Ministerio del Poder Popular para la Salud, la Federación Venezolana de Psicólogos de Venezuela (FVP) y demás instituciones pertinentes y correspondientes según cada especialidad.</li>
  <li>Realizar las facturas de los pagos, única y exclusivamente de aquellos efectuados del Especialista a Delta Salud.</li>
  <li>Fomentar la seguridad y la protección de los datos para así proteger a los Especialistas.</li>
  <li>Optimizar la comunicación y experiencia del Especialista.</li>
</ol>

<h3>INTERACCIÓN DEL ESPECIALISTA</h3>

<h3>Interfaz Amigable.</h3>
<p>Diseñamos una interfaz minimalista con navegación intuitiva y opciones claramente visibles, centrada en los Especialistas para facilitar una interacción en un lenguaje natural y ameno para los Especialistas. Asimismo, en Delta Salud te proveemos guías rápidas para que aprendas a interactuar con el software de manera eficiente.</p>

<h3>Respuestas rápidas y personalizadas.</h3>
<p>En Delta Salud priorizamos la interacción que tiene el Especialista con la Inteligencia Artificial, por lo cual la herramienta toma ciertas medidas para garantizar la satisfacción en el servicio y las respuestas dadas:</p>
<ol>
  <li>Optimizamos los procesos internos y consultas de algoritmos y contamos con una infraestructura robusta para garantizar buenos tiempos de respuesta.</li>
  <li>Diseñamos interacciones que se adapten a los perfiles de los Especialistas, utilizando la información específica proporcionada y recordando las conversaciones anteriores para ajustar las respuestas y sugerencias, ofreciendo continuidad y relevancia.</li>
</ol>

<h3>ÉTICA EN LA INTELIGENCIA ARTIFICIAL.</h3>

<h3>Integración de Herramientas de Inteligencia Artificial.</h3>
<p>Delta Salud proporciona al Especialista herramientas de Inteligencia Artificial basadas en el modelo Gemini (propiedad de Google LLC), con el propósito de optimizar la gestión del consultorio, permitiendo al Especialista: (i) transcribir las consultas médicas con los pacientes, (ii) generar resúmenes de la historia médica del paciente, (iii) optimizar y mejorar la historia médica del paciente y (iv) optimizar y mejorar la redacción de textos profesionales.</p>

<h3>Funcionamiento, errores y sesgos algorítmicos de la Inteligencia Artificial.</h3>
<p>El Especialista reconoce y acepta que: (i) la herramienta de Inteligencia Artificial opera bajo un modelo de procesamiento de lenguaje natural y su funcionamiento y precisión depende exclusiva y directamente de la calidad, claridad, veracidad y volumen de datos suministrados por el Especialista, la Inteligencia Artificial no genera diagnósticos ni posee intuición médica, solo se limita a procesar la información suministrada por el Especialista; (ii) la Inteligencia Artificial puede generar resultados inexactos, incompletos, desactualizados o falsos, u omitir datos clínicos críticos que hayan sido mencionados en la grabación o en los textos de origen; (iii) las respuestas de la Inteligencia Artificial pueden presentar sesgos algorítmicos inherentes a los datos con que el modelo global fue entrenado por su proveedor (Google LLC); y (iv) ningún resultado, resumen o transcripción emitida por Gemini tiene carácter de dictamen médico definitivo, ni es vinculante para el ejercicio profesional, por lo que el Especialista mantiene en todo momento el control editorial y clínico, estando obligado a revisar, corregir y validar todo contenido generado por la Inteligencia Artificial antes de guardarlo, firmarlo o entregarle un informe al paciente.</p>

<h3>Exclusión absoluta de responsabilidad.</h3>
<p>Al ser una herramienta de uso opcional y complementario, Delta Salud no se hará responsable por diagnósticos erróneos, tratamientos equivocados, fallas de medicación, omisiones clínicas o cualquier tipo de reclamo legal o perjuicio que ocurra si el Especialista decide aplicar, guardar, firmar o compartir un contenido generado por la Inteligencia Artificial sin haberlo verificado y corregido previamente. El riesgo derivado de la falta de revisión corre exclusivamente por cuenta del Especialista.</p>

<h3>Uso inadecuado del bot.</h3>
<p>Para evitar el uso inadecuado de los datos procurados por los Especialistas, existen limitaciones en el uso del bot dentro de nuestras políticas e implementamos restricciones en las funcionalidades que puedan ser utilizadas para prácticas no éticas.</p>

<h3>CUMPLIMIENTO NORMATIVO</h3>
<p>En Delta Salud, tomamos muy en serio el cumplimiento de las leyes y regulaciones por lo que:</p>
<ol>
  <li>Operamos dentro de todas las normativas aplicables, dentro de los referentes internacionales hasta las leyes de accesibilidad y otras regulaciones locales.</li>
  <li>Solicitamos el consentimiento claro de los Especialistas antes de recopilar cualquier información personal.</li>
  <li>Facilitamos a los Especialistas el acceso, modificación y eliminación de sus datos a través de un portal diseñado para ellos.</li>
</ol>

<h3>COMPATIBILIDAD E INTEGRACIÓN</h3>
<p>Para que Delta Salud funcione de manera óptima y la experiencia sea fluida con las diversas herramientas y plataformas utilizamos:</p>
<ol>
  <li>La implementación de API abiertas y bien documentadas que facilitan la conexión con sistemas populares como Google Calendar y Microsoft Outlook.</li>
  <li>Nuestro diseño modular permite que Delta Salud se adapte a diferentes entornos tecnológicos, garantizando su funcionamiento sin importar el software o hardware que utilices.</li>
  <li>Realizamos pruebas de integración para simular interacciones con estas plataformas, asegurando que todo funcione sin problemas y maximizando así el impacto positivo del bot en tu día a día.</li>
</ol>

<h3>SOPORTE TÉCNICO Y PERSONALIZACIÓN</h3>
<p>Para que el soporte técnico de Delta Salud sea eficaz y podamos garantizar la calidad del servicio contamos con:</p>
<ol>
  <li>Capacidad para ajustar el tamaño de nuestro equipo de soporte según las necesidades, especialmente en momentos de mayor demanda.</li>
  <li>Sistemas de priorización para asegurarnos de que los problemas más urgentes se resuelvan primero.</li>
</ol>

<h2>CAPÍTULO III. SUSCRIPCIONES Y PAGOS.</h2>

<h3>Modalidades de planes y suscripciones.</h3>
<p>Delta Salud ofrece distintas modalidades de acceso para adaptarse a las necesidades del Especialista. Las características comerciales y tarifas vigentes de cada plan se encuentran detalladas en la Sección de Precios de la Web, incorporándose los siguientes niveles de licenciamiento:</p>
<ol>
  <li><strong>Plan Gratuito:</strong> permite al Especialista utilizar las funciones básicas de agendamiento de citas y registro de atención de pacientes. Bajo esta modalidad, no está habilitada la función de descarga o exportación masiva de datos, así como tampoco el acceso a las herramientas de Inteligencia Artificial.</li>
  <li><strong>Plan Básico:</strong> permite al Especialista la gestión de agenda, registro de atención de pacientes y habilita la facultad de descargar y exportar la información e historias clínicas ingresadas en la plataforma. No incluye el uso de las herramientas de Inteligencia Artificial.</li>
  <li><strong>Plan Plus:</strong> otorga al Especialista acceso total, ilimitado y completo a todas las herramientas y servicios provistos por Delta Salud, incluyendo de manera exclusiva el módulo de asistencia mediante Inteligencia Artificial.</li>
</ol>

<h3>Modificaciones.</h3>
<p>Delta Salud se reserva el derecho de modificar las tarifas de sus planes en cualquier momento. Cualquier aumento de precio será notificado al Especialista a través de los canales autorizados.</p>

<h3>Renovación y Cancelación.</h3>
<p>Las suscripciones se renovarán de forma automática por períodos iguales al contratado. El Especialista podrá cancelar la renovación en cualquier momento desde su panel de configuración, surtiendo efecto a partir del término del período facturado en curso. No se realizarán reembolsos parciales por períodos no utilizados.</p>

<h3>Penalidad por impago o pago tardío:</h3>
<p>El retraso en el pago de la suscripción generará la suspensión automática del acceso del Especialista a Delta Salud. Durante el período de suspensión, y en resguardo de los derechos de los pacientes, Delta Salud mantendrá custodiadas las historias clínicas y datos almacenados por un plazo máximo de quince (15) días continuos, tras los cuales, si no se liquida el saldo deudor, se procederá a la restricción total o eliminación de la cuenta.</p>

<h3>Métodos de Pago.</h3>
<p>El Especialista podrá efectuar el pago de sus suscripción por los siguientes canales:</p>
<ol>
  <li>Pago Móvil.</li>
  <li>Transferencia en Bolívares.</li>
  <li>Binance.</li>
  <li>Efectivo.</li>
</ol>

<h2>CAPÍTULO IV. USOS DE LA APLICACIÓN.</h2>

<h3>Licencia de Software.</h3>
<p>El software integrado o asociado con Delta Salud se proporciona bajo una licencia de "algunos derechos reservados".</p>

<h3>Tecnología de Bloqueo.</h3>
<p>Los Especialistas reconocen que, al aceptar los presentes Términos, están accediendo a los permisos del usuario requeridos por la aplicación, los cuales permiten el acceso a la data de su teléfono, incluyendo de manera enunciativa pero no limitativa al acceso a la cámara, contactos, conexión Wi-Fi.</p>

<h2>CAPÍTULO V. COMPLIANCE.</h2>

<ol>
  <li>Delta Salud mantiene relaciones con Especialistas confiables, debidamente verificados en las instituciones pertinentes.</li>
  <li>Delta Salud determina que no mantiene operaciones con:
    <ol type="a">
      <li>Comercios que ejerzan actividades económicas aparentemente ficticias o con signos de sobrefacturación o subfacturación, así como con estructuras corporativas que simulan operaciones.</li>
      <li>Comercios que efectúan operaciones de negocios y financieras con divisas en efectivo sin una justificación clara y razonable.</li>
      <li>Comercios que tengan domicilios fiscales en zonas residenciales que no pueden ser verificados.</li>
      <li>Comercios con importantes debilidades en aspectos administrativos, contables, financieros, legales y fiscales, según los informes de auditores.</li>
      <li>Comercios que de forma recurrente son sancionados por las autoridades gubernamentales.</li>
      <li>Comercios cuyos empleados, miembros de la junta directiva, accionistas, clientes o proveedores estén mencionados en noticias por la presunta comisión de delitos asociados con la Delincuencia Organizada en todas sus modalidades o que estén mencionados en las listas ejecutivas de las Resoluciones del Consejo de Seguridad de Naciones (RCSNU), relacionadas con la prevención y supresión del terrorismo, el financiamiento al terrorismo y el financiamiento a la proliferación de armas de destrucción masiva.</li>
      <li>Comercios con operaciones regulares hacia países catalogados como productores de drogas según el informe de "Tendencias Mundiales de las Drogas" publicado por la Organización de Naciones Unidas o jurisdicción de alto riesgo en materia de Legitimación de Capitales, el Financiamiento al Terrorismo o el Financiamiento a la Proliferación de Armas de Destrucción Masiva, según el GAFI.</li>
    </ol>
  </li>
</ol>

<h3>Casos fortuitos o fuerza mayor.</h3>
<p>Las partes declaran, admiten y convienen expresamente que, quedan relevadas de responsabilidad por el incumplimiento total o parcial de sus obligaciones cuando tal incumplimiento obedezca al caso fortuito o fuerza mayor. Las obligaciones que hayan quedado pendientes entre las partes, con ocasión al presente contrato, se suspenderán por el período que permanezcan vigentes las circunstancias calificadas como casos fortuitos o de fuerza mayor.</p>

<h3>Derechos de Propiedad Intelectual.</h3>
<p>Sin perjuicio de disposiciones más específicas de estos Términos, los derechos de propiedad intelectual como derechos de autor, derechos de marca, derechos de patente y derechos de diseño relacionados con Delta Salud son propiedad exclusiva de Delta Salud o sus licenciantes y están protegidos por las leyes de marcas aplicables y los tratados internacionales relacionados.</p>
<p>Todas las marcas comerciales registradas, ya sean denominativas o gráficas, y todas las demás marcas comerciales, nombres comerciales, marcas de servicio, marcas denominativas, ilustraciones, imágenes o logotipos que aparecen en relación con Delta Salud son y seguirán siendo propiedad exclusiva de Delta Salud o sus licenciantes y están protegidas por las leyes aplicables, leyes de marcas y tratados internacionales relacionados.</p>

<h3>Cambios de las presentes condiciones.</h3>
<p>Delta Salud se reserva el derecho de cambiar o modificar estos Términos en cualquier momento. En tales casos, Delta Salud informará oportunamente a los Especialistas de estos cambios.</p>
<p>Estos cambios afectarán a las relaciones con los Especialistas únicamente a partir de la fecha en que se pongan en conocimiento de los Especialistas.</p>
<p>El uso continuado del Servicio constituirá la aceptación de los Especialistas de los Términos modificados. Si los Especialistas no desean estar sujetos a estos cambios, deben dejar de utilizar el Servicio y pueden rescindir el Acuerdo. La versión anterior aplicable regirá la relación hasta su aceptación por parte del Especialistas. Los Especialistas pueden obtener cualquier versión anterior de Delta Salud.</p>
<p>Si lo exige la ley, Delta Salud notificará a los Especialistas antes de la fecha de entrada en vigor de los Términos modificados.</p>

<h3>Del contrato.</h3>
<p>Delta Salud tiene derecho a ceder, transferir, disponer por novación o subcontratar cualesquiera derechos u obligaciones establecidos de conformidad con estos Términos, teniendo en cuenta los intereses legítimos del Especialista.</p>
<p>Las disposiciones relativas a los cambios a estos Términos se aplican mutatis mutandis. Los Especialistas no podrán ceder ni transferir sus derechos u obligaciones bajo estos Términos de ninguna manera.</p>

<h2>CAPÍTULO VI. LEY Y JURISDICCIÓN APLICABLE.</h2>

<p>Estos Términos se rigen por las leyes del lugar donde se encuentra la sede Delta Salud, según lo establecido en la sección correspondiente del presente, sin tener en cuenta principios de conflictos de leyes.</p>

<h3>Usos Aceptables.</h3>
<p>Delta Salud y el Servicio solo se pueden utilizar en el área para la que se proporciona, de acuerdo con estos Términos y la ley aplicable.</p>
<p>Delta Salud se reserva el derecho de tomar medidas apropiadas para proteger sus intereses legítimos, incluyendo denegar a los Especialistas el acceso a Delta Salud o al Servicio, rescindir contratos, informar comportamientos inapropiados llevados a cabo a través de Delta Salud o el Servicio a autoridades competentes como autoridades judiciales o administrativas. Cuando los Especialistas cometan o sean sospechosos de cometer cualquiera de las siguientes acciones:</p>
<ul>
  <li>Violaciones de leyes, regulaciones y/o estos Términos;</li>
  <li>Violación de los derechos de terceros;</li>
  <li>Causar daño significativo a los intereses legítimos de Delta Salud;</li>
  <li>Ofender a Delta Salud o a cualquier tercero.</li>
</ul>

<h3>Posibilidad de separar una disposición.</h3>
<p>En el caso de que cualquier disposición de estos Términos sea declarada o se vuelva inválida o inaplicable de conformidad con cualquier ley aplicable, la invalidez o inaplicabilidad de dicha disposición no afectará la validez de las disposiciones restantes, que continuarán en pleno vigor y efecto.</p>

<h2>CAPÍTULO VII. RESOLUCIÓN DE CONFLICTOS.</h2>

<h3>Resolución amistosa de conflictos.</h3>
<p>Los Especialistas podrán comunicar cualquier conflicto a Delta Salud quien intentará resolverlo pacíficamente.</p>
<ul>
  <li>Aunque el derecho de los Especialistas a emprender acciones legales no se verá afectado en ningún momento, en caso de una disputa relacionada con el uso de Delta Salud y el servicio proporcionado como intermediario, se recomienda a los Especialistas que se comuniquen con Delta Salud utilizando los datos de contacto proporcionados en este documento. El Especialista podrá formular su reclamación, incluyendo una breve descripción enviándola a la dirección de correo electrónico de Delta Salud facilitada en este documento.</li>
  <li>Delta Salud tramitará la reclamación sin demoras indebidas y dentro de los 21 días siguientes a su recepción.</li>
</ul>

<h3>Resolución de Controversias.</h3>
<p>Toda controversia y/o diferencia que pueda surgir, en relación a los efectos legales de este contrato, que verse sobre la existencia, extensión, interpretación y cumplimiento del mismo, que no puedan ser resueltas amistosamente entre LAS PARTES, eligen que será resuelta definitivamente mediante un procedimiento de arbitraje institucional de derecho, en la Ciudad de Caracas, República Bolivariana de Venezuela, de acuerdo con las disposiciones del Reglamento General del Centro Empresarial de Conciliación y Arbitraje (CEDCA), de conformidad con los procedimientos, términos y demás reglas previstas para el arbitraje en dicho Reglamento General que se encuentre vigente para la fecha de la controversia. El Tribunal Arbitral estará compuesto por un (1) árbitro que decidirá conforme a derecho. El árbitro será elegido por LAS PARTES de la lista de árbitros suscritos y autorizados por el Centro Empresarial de Conciliación y Arbitraje (CEDCA), podrá ser designado de mutuo acuerdo por ambas partes, o en su defecto, a falta de acuerdo entre éstas, por el Comité Ejecutivo del Centro Empresarial de Conciliación y Arbitraje (CEDCA) dentro del plazo y en la forma previstas en su Reglamento General. El arbitraje se llevará a cabo en el Centro Empresarial de Conciliación y Arbitraje (CEDCA). El idioma del arbitraje será el castellano y para dictar su laudo tendrán siempre en cuenta las reglas de interpretación y ejecución contenidas en el presente contrato, las normas, usos y costumbres mercantiles y la legislación vigente aplicable al caso dentro de la República Bolivariana de Venezuela. El laudo será inapelable y salvo en lo que se refiere al recurso de nulidad previsto en el artículo 43 de la Ley de Arbitraje Comercial, contra él no se admitirá recurso adicional alguno. Conforme a lo dispuesto por el artículo 26 de la Ley de Arbitraje Comercial de Venezuela, ambas partes otorgan plenas facultades al tribunal arbitral designado, para dictar las medidas cautelares solicitadas por las partes y que consideren conducentes a los fines de la resolución de la controversia.</p>
<p>En virtud del presente acuerdo de arbitraje, las partes renuncian a hacer valer sus pretensiones ante los tribunales ordinarios con competencia en razón de la cuantía y materia; por ello, la sumisión a arbitraje prevista en esta sección deberá interpretarse como exclusiva y, por lo tanto, excluyente de la jurisdicción ordinaria, así como también, LAS PARTES renuncian expresamente a hacer valer sus pretensiones ante cualquier tribunal extranjero o árbitros distintos a los previstos en esta cláusula.</p>
<p>Las partes eligen como domicilio especial para el presente contrato, de manera exclusiva y excluyente, a la ciudad de Caracas. Para su ejecución e interpretación rigen las disposiciones legales vigentes en el territorio de la República Bolivariana de Venezuela.</p>
<p>El presente contrato, se extiende en dos (2) ejemplares, a un mismo tenor y de un solo efecto, ambos originales, igualmente válidos, será rubricado por ambas partes en cada uno de sus folios y suscrito, al pie del último en señal de conformidad.</p>

<h3>CONTACTO.</h3>
<p>Todas las comunicaciones relacionadas con el uso de Delta Salud deben enviarse utilizando la información de contacto que figura en este documento: (i) Número de Teléfono: +58 422-1033582.</p>`;

module.exports = {
  async up(queryInterface, Sequelize) {
    // -----------------------------------------------------------------------
    // 1. Create legal_documents table
    // -----------------------------------------------------------------------
    await queryInterface.createTable('legal_documents', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doc_type: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      version: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      content_html: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_current: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Index for efficient lookup of the current document by type.
    await queryInterface.addIndex('legal_documents', ['doc_type', 'is_current'], {
      name: 'idx_legal_documents_doc_type_is_current',
    });

    // -----------------------------------------------------------------------
    // 2. Insert the initial Terms & Conditions document.
    //    Uses a parameterised query to safely embed the HTML without escaping.
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `INSERT INTO legal_documents (id, doc_type, version, content_html, is_current, created_at, updated_at)
       VALUES (gen_random_uuid(), 'terms', '2026-07', :contentHtml, true, NOW(), NOW())`,
      {
        replacements: { contentHtml: TERMS_HTML },
      },
    );

    // -----------------------------------------------------------------------
    // 3. Add terms acceptance columns to profiles.
    // -----------------------------------------------------------------------
    await queryInterface.addColumn('profiles', 'terms_accepted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('profiles', 'terms_accepted_version', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    // Remove profile columns first (foreign key dependency is safe to drop).
    await queryInterface.removeColumn('profiles', 'terms_accepted_version');
    await queryInterface.removeColumn('profiles', 'terms_accepted_at');

    // Drop the legal_documents table (CASCADE removes the index automatically).
    await queryInterface.dropTable('legal_documents');
  },
};
