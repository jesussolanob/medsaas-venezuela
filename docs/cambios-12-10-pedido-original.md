Cambios 12-10

**Precio:** Al precio en todas las pantallas donde se muestra el precio, al plan base que lo tenemos en promo agregar de manera que sea notorio una nota de promo/descuento/precio lanzamiento, como se vea mejor

**Plantillas:** Crearemos plantillas pre-creadas en el modulo de plantillas, ejemplo: recipes mas utilizados, paraclinicos mas comunes, reposos pre-creados

- En recipes, se debe crear un boton que se ubique encima de donde dice vista previa, para crear recipes como plantillas, se debe utilizar la misma logica del modal de recipes que se tiene en consulta solo que antes se le debe crear un nombre para que el especialista lo pueda identificar.
- En paraclinicos lo mismo que en recipes, se debe utilizar el modal de paraclinicos del modulo de consultas con un nombre antes de crearlo para poder identificarlo
- Lo mismo para reposos
- Lo mismo para presupuestos pero con el modulo de presupuestos en vez de consultas
- Debemos crear un boton adicional que se llame plantillas donde el especialista tenga el inventario de plantillas pre-creadas

**Consultas:** Para utilizar las plantillas pre-creadas de recipes, paraclinicos y reposos

- Se debe agregar un boton cuando se abre el bloque que corresponde de seleccionar las plantillas a traves de un listado de plantillas
- Este boton solo debe mostrar las plantillas que corresponden al bloque, ejemplo, si estoy creando un recipe, debe mostrar solo las plantillas de recipes pre-creada
- En recipes lo colocaria al lado de generar receta (cambiar a generar recipe) como Usar plantilla
- En paraclinico lo colocaria abajo de agregar examen (usar plantilla)
- En reposo lo crearia arriba como usar plantilla

Es muy importante permitir editar al especialista la plantilla en la consulta, por si quiere alargar los dias del recipe, reposo, agregar indicaciones adicionales en los paraclinicos

**Presupuestos:** Para utilizar las plantillas pre-creadas, en el modal nuevo presupuesto, en la fila items agregaria boton plantillas y se despliega un pop-up con las plantillas pre-creadas, al seleccionar, se cierra el pop-up y el modal debe tener la info descargada

Es muy importante permitir editar al especialista la plantilla en la creacion del presupuesto por si quiere cambiar los precios o las unidades

**Modulo recipes y paraclinicos:** La idea de este modulo es poder crear recipes y asociarlos a pacientes, sin necesidad de generar una consulta, debe funcionar de la siguiente forma:

- Boton en el inicio de generar recipe/paraclinico
- Boton en el side menu, en consultorio, de recipes y paraclinicos

Una vez se cree el boton en el side menu, esta pantalla debe mostrar un inventario de recipes y paraclinicos creados que no estan asociados a una consulta, fecha de creacion y paciente. Esta pantalla debe tener un boton de Generar recipe/paraclinico Tambien

El boton generar recipe/paraclinico (tanto en el inicio como en la pantalla de recipes y paraclinicos) debe abrir el mismo modal, ese modal debe pedir:

- Paciente (como se pide cuando se crea una consulta inmediata)
- Si el paciente no esta creado deberia poder crear paciente (como se crea en una consulta inmediata)
- Seleccionar si es recipe o paraclinico
- Boton para usar plantillas pre-creadas
- Boton para generar recipe o paraclinico desde cero (Generar nuevo)
- Al seleccionar el boton de usar plantillas se debe desplegar listado de plantillas segun se haya seleccionado
- Se debe crear boton de guardar, boton de cancelar, boton de crear y boton de crear y enviar
- Se deben crear los documentos con el mismo formato que el modulo de consultas. No crear formatos nuevos
- Los recipes y paraclinicos creados se deben asociar al paciente en el modulo de pacientes, en el detalle de cada paciente, donde esta el historial de consultas, historial medico y seguimiento, un 4 boton que diga Recipes y paraclinicos y aparezca el inventario de lo creado a este paciente sin consulta.

Es importante que estos nuevos desarrolles no toquen nada que no deben tocar de lo ya desarrollado, solo agregar las nuevas opciones
