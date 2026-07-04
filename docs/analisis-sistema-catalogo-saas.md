# Analisis funcional y tecnico del sistema de catalogos SaaS

## 1. Resumen ejecutivo

El sistema actual es una aplicacion SaaS para que pequenos negocios creen un catalogo digital publico, administren productos, categorias, pedidos y clientes, y reciban solicitudes de compra mediante WhatsApp. El cliente final navega un catalogo publico, agrega productos al carrito, diligencia datos de entrega y confirma el pedido por WhatsApp. Al mismo tiempo, el sistema registra el pedido, actualiza stock y consolida la informacion del cliente.

La aplicacion esta construida con React + Vite, usa Firebase Authentication para autenticacion, Firestore como base de datos, Firebase Storage para algunos recursos de tienda, Cloudinary para imagenes/videos de productos y Firebase Functions para operaciones administrativas de suscripcion.

La idea para la nueva version es replicar la funcionalidad en Supabase, con una interfaz mas moderna, mejor rendimiento para catalogos grandes y un modelo de datos relacional mas mantenible.

## 2. Objetivo del sistema

Permitir que un negocio pueda:

- Crear una tienda digital con enlace publico propio.
- Publicar productos con imagenes, videos, precios, descuentos, variantes y stock.
- Organizar productos por categorias.
- Compartir catalogos completos o categorias por link, WhatsApp o redes.
- Recibir pedidos desde un carrito publico.
- Registrar clientes automaticamente a partir de pedidos.
- Gestionar estados de pedidos.
- Consultar metricas basicas del negocio.
- Configurar identidad visual, datos de contacto, metodos de envio y campos personalizados del checkout.
- Controlar acceso mediante suscripcion, prueba gratis o activacion administrativa.

## 3. Roles de usuario

### Visitante publico

Usuario no autenticado que abre el catalogo de una tienda mediante `/#/:slug`.

Puede:

- Ver informacion de la tienda.
- Navegar categorias.
- Buscar productos.
- Ver productos, imagenes, videos y variantes.
- Agregar productos al carrito.
- Elegir tipo de catalogo publico o mayorista mediante query param.
- Elegir metodo de envio si esta habilitado.
- Completar datos de compra.
- Enviar pedido por WhatsApp.

No puede:

- Crear, editar o eliminar productos.
- Ver pedidos de otros clientes.
- Acceder al panel administrativo.

### Administrador de tienda

Usuario autenticado asociado a una tienda mediante `ownerUid`.

Puede:

- Entrar al dashboard.
- Administrar productos.
- Administrar categorias.
- Ver y actualizar pedidos.
- Ver clientes e historial de compra.
- Configurar la tienda.
- Revisar su suscripcion.
- Compartir links del catalogo.

### Superadministrador

Usuario autenticado con email fijo `inteliasb@gmail.com`.

Puede:

- Ver tiendas registradas.
- Auditar datos basicos de tienda y propietario.
- Activar o desactivar tiendas.
- Abrir catalogos publicos.
- Copiar datos de contacto/auditoria.

## 4. Modulos actuales del sistema

## 4.1 Landing publica

Ruta: `/`

Modulo orientado a conversion comercial del SaaS.

Funcionalidades:

- Presenta propuesta de valor: catalogo digital, carrito y pedidos por WhatsApp.
- Muestra beneficios: publicacion rapida, variantes, fotos, diseno responsive.
- Incluye mock visual de un catalogo.
- Incluye CTA para empezar y ver demo.

Observacion:

- Actualmente los botones principales no parecen tener navegacion activa hacia registro/demo. En la nueva version deberian enlazar a registro, demo interactiva o WhatsApp comercial.

## 4.2 Registro de tienda

Ruta: `/admin/register`

Funcionalidades:

- Crea usuario con email y password.
- Actualiza nombre del perfil autenticado.
- Crea documento de tienda asociado al usuario.
- Captura datos del administrador:
  - Nombre.
  - Email.
  - Password.
- Captura datos del negocio:
  - Nombre.
  - Tipo de negocio.
  - Ciudad.
  - Slug publico.
  - WhatsApp.
  - Direccion opcional.
- Genera slug sugerido desde el nombre de la tienda.
- Valida WhatsApp como numero de 10 a 15 digitos.
- Soporta origen `source=client`.
- Si el registro viene desde `source=client`, crea una prueba gratis de 7 dias.
- Si no viene desde `source=client`, crea una tienda de tipo `one_time` con suscripcion inactiva.

Reglas de negocio:

- Password minimo 6 caracteres.
- WhatsApp debe incluir codigo de pais.
- La prueba gratis activa `hasActiveSubscription`.
- La prueba gratis guarda:
  - `hasFreeTrial`.
  - `freeTrialDays`.
  - `freeTrialStatus`.
  - `trialStartedAt`.
  - `trialEndsAt`.
  - `trialEndsAtMs`.

Recomendacion para Supabase:

- Usar Supabase Auth para usuarios.
- Crear tabla `stores`.
- Crear trigger o funcion RPC `create_store_for_user` para crear tienda y perfil en una transaccion.
- Validar unicidad de `slug` a nivel de base de datos.

## 4.3 Login y recuperacion de password

Ruta: `/admin/login`

Funcionalidades:

- Login con email y password.
- Mostrar/ocultar password.
- Recuperacion de password por correo.
- Redirecciona al panel si el usuario ya esta autenticado.

Recomendacion para Supabase:

- Usar `supabase.auth.signInWithPassword`.
- Usar `supabase.auth.resetPasswordForEmail`.
- Agregar flujo de actualizacion de password despues del link de recuperacion.

## 4.4 Proteccion de rutas

Rutas admin bajo `/admin`.

Funcionalidades:

- Verifica sesion activa.
- Si no hay usuario, redirecciona a `/admin/login`.
- Muestra estado de carga mientras Firebase resuelve la sesion.

Superadmin:

- Verifica email exacto `inteliasb@gmail.com`.
- Bloquea acceso a cualquier otro usuario.

Recomendacion para Supabase:

- Usar `auth.users`.
- Crear tabla `profiles` con `role`.
- Reemplazar email fijo por roles: `superadmin`, `store_admin`.
- Aplicar Row Level Security.

## 4.5 Dashboard administrativo

Ruta: `/admin`

Objetivo:

Dar resumen rapido del negocio y accesos directos.

Funcionalidades:

- Busca tienda por `ownerUid`.
- Muestra link publico del catalogo.
- Permite abrir catalogo.
- Permite copiar link.
- Muestra metricas:
  - Total de productos.
  - Total de pedidos.
  - Total de clientes.
  - Ingresos calculados sobre los ultimos 50 pedidos.
  - Pedidos de hoy calculados sobre los ultimos 50 pedidos.
- Muestra ultimos 5 pedidos.
- Muestra estado, cliente, telefono y total.
- Acciones rapidas:
  - Nuevo producto.
  - Compartir catalogo.
  - Abrir catalogo publico.
- Cachea datos por 60 segundos para reducir lecturas.

Limitacion actual:

- Ingresos no son historicos reales; se calculan sobre los ultimos 50 pedidos.

Recomendacion para Supabase:

- Crear vistas/materialized views o RPC para metricas:
  - `store_dashboard_summary`.
  - `recent_orders`.
- Calcular ingresos por rango: hoy, 7 dias, 30 dias, total.
- Evitar traer documentos completos si solo se necesitan contadores.

## 4.6 Administracion de categorias

Ruta: `/admin/categories`

Funcionalidades:

- Lista categorias por orden.
- Crea categoria con nombre y orden.
- Edita nombre y orden.
- Elimina categoria.
- Reordena categorias con drag and drop.
- Guarda nuevo orden en batch.
- Pagina localmente de 20 en 20.
- Genera link directo a categoria: `/#/:slug?category=:categoryId`.
- Copia link de categoria.
- Comparte categoria por WhatsApp.
- Usa Web Share API si esta disponible.

Reglas:

- Cada categoria pertenece a una tienda.
- El orden define la presentacion en el catalogo publico.
- La eliminacion de categoria no valida si existen productos asociados; esto deberia mejorarse.

Recomendacion para Supabase:

- Tabla `categories`.
- Campos: `id`, `store_id`, `name`, `sort_order`, `created_at`, `updated_at`.
- Indice por `(store_id, sort_order)`.
- Agregar restriccion o flujo para manejar productos al eliminar categoria:
  - Bloquear eliminacion si tiene productos.
  - Mover productos a "Sin categoria".
  - Permitir eliminacion en cascada solo si se confirma explicitamente.

## 4.7 Administracion de productos

Ruta: `/admin/products`

Es el modulo mas grande del sistema.

Funcionalidades principales:

- Lista productos paginados de 10 en 10.
- Crea productos.
- Edita productos.
- Elimina productos.
- Elimina todos los productos.
- Activa/desactiva productos.
- Reordena productos con drag and drop.
- Busca productos por nombre, SKU o descripcion.
- Exporta productos a Excel.
- Importa productos desde Excel.
- Importa productos desde JSON.
- Maneja limites por plan.
- Maneja imagenes, videos, variantes, descuentos, precios mayoristas y pago contra entrega.

Campos de producto:

- Nombre.
- SKU.
- Descripcion.
- Precio base.
- Precio mayorista opcional.
- Categoria.
- Imagenes.
- Videos.
- Opciones.
- Variantes.
- Estado activo/inactivo.
- Permite pago contra entrega.
- Descuento:
  - Porcentaje.
  - Valor fijo COP.
- Orden.
- Fechas de creacion/actualizacion.

Limites por plan:

- Plan gratuito/pago unico:
  - Maximo 300 productos.
  - Maximo 1 imagen por producto.
  - Sin videos.
- Plan con suscripcion activa:
  - Maximo 5 imagenes por producto.
  - Maximo 1 video por producto.

Variantes:

- Usa un editor de variantes.
- Permite opciones como color/talla.
- Genera combinaciones cartesianas.
- Cada variante puede tener:
  - ID.
  - Titulo.
  - Valores de opcion.
  - Precio.
  - Stock.
  - SKU.
  - Imagen asociada.
  - Video opcional.

Precios y descuentos:

- Precio base en COP.
- Precio mayorista se usa cuando el catalogo se abre con `?tipo=mayorista`.
- Descuento puede ser porcentaje o monto fijo.
- En catalogo normal, el descuento se aplica al precio base o variantes.
- En catalogo mayorista, si existe precio mayorista, no se aplica descuento normal.

Importacion/exportacion:

- Exporta Excel con:
  - ID.
  - Nombre.
  - SKU.
  - Descripcion.
  - Categoria.
  - Precio.
  - Precio formateado.
  - Precio mayorista.
  - Descuentos.
  - Precio final.
  - Imagenes.
  - Videos.
  - Estado.
  - Contra entrega.
  - Variantes.
  - Opciones.
- Descarga plantilla de importacion.
- Importa Excel usando `xlsx`.
- Importa JSON con estructura simple o `{ products: [] }`.
- Puede crear categorias automaticamente durante importacion.
- Respeta limites de productos para plan gratuito.

Multimedia:

- Imagenes de productos se comprimen antes de subir.
- Usa Cloudinary unsigned upload para imagenes y videos de producto.
- Usa transformaciones Cloudinary para optimizar imagenes en frontend.
- Valida videos con limite de tamano y duracion.
- Configuracion relacionada:
  - `VITE_CLOUDINARY_CLOUD_NAME`.
  - `VITE_CLOUDINARY_UPLOAD_PRESET`.

Problemas/riesgos actuales:

- La busqueda del admin carga todos los productos en memoria. Con 10.000 productos puede ser costoso.
- Exportar todos los productos tambien lee todo, aunque esto es aceptable si es una accion ocasional.
- Reordenar productos paginados puede ser complejo porque el orden global depende de offset.
- No se observa validacion fuerte de slug unico en registro.
- El modulo hace muchas responsabilidades en un solo componente.

Recomendacion para Supabase:

- Separar en tablas:
  - `products`.
  - `product_images`.
  - `product_videos`.
  - `product_options`.
  - `product_variants`.
- Usar `tsvector` o `pg_trgm` para busqueda.
- Usar Storage de Supabase o mantener Cloudinary si se quiere CDN/transformaciones avanzadas.
- Crear Edge Functions para importaciones masivas.
- Crear job para normalizar busqueda y slugs.

## 4.8 Catalogo publico

Ruta: `/:slug`

Objetivo:

Mostrar catalogo publico de una tienda y permitir pedidos por WhatsApp.

Funcionalidades:

- Busca tienda por slug.
- Verifica disponibilidad de tienda:
  - Tienda inexistente.
  - Tienda inactiva.
  - Suscripcion inactiva.
  - Suscripcion vencida.
  - Prueba gratis vencida.
- Mantiene compatibilidad con clientes antiguos de pago unico.
- Muestra pantalla de catalogo no disponible cuando corresponde.
- Carga categorias.
- Permite filtrar por categoria desde URL.
- Permite catalogo mayorista con `?tipo=mayorista`.
- Muestra productos paginados.
- Permite cargar mas productos.
- Permite busqueda.
- Muestra imagen principal optimizada.
- Muestra descuento.
- Muestra precios normales o mayoristas.
- Muestra producto modal con variantes/cantidad.
- Agrega productos al carrito.
- Persiste carrito en `localStorage` por slug y tipo de catalogo.
- Maneja cantidades y stock.
- Permite vaciar carrito.
- Permite checkout.
- Registra pedido en base de datos.
- Registra/actualiza cliente.
- Descuenta stock en transaccion.
- Abre WhatsApp con mensaje de pedido.

Checkout:

Campos base obligatorios:

- Nombre.
- Telefono.
- Direccion.

Campos personalizados:

- Configurables desde ajustes.
- Tipos:
  - Texto corto.
  - Numero.
  - Telefono.
  - Email.
  - Texto largo.
  - Lista.
  - Fecha.
- Pueden ser obligatorios u opcionales.
- Pueden estar habilitados u ocultos.

Envios:

- Se puede activar o desactivar el modulo de envio.
- Metodos:
  - Contra entrega.
  - Transportadora.
- Cada metodo puede tener costo.
- Se puede ocultar precios de envio.
- Se puede mostrar nota de envio.
- Producto puede bloquear pago contra entrega con `allowsCashOnDelivery=false`.

Pedido:

- Crea documento en `orders`.
- Crea o actualiza documento en `clients`.
- Guarda:
  - Items.
  - Subtotales.
  - Total.
  - Metodo de envio.
  - Costo de envio.
  - Datos del cliente.
  - Campos personalizados.
  - Estado inicial.
  - Canal `whatsapp`.
- Usa transaccion para validar stock y actualizar cantidades.

Optimizacion reciente:

- La carga del catalogo publico fue ajustada para paginar realmente con `limit` y `startAfter`.
- La busqueda publica ya no descarga todos los productos; consulta por prefijo y mezcla con productos ya cargados.

Recomendacion para Supabase:

- Usar endpoints/RPC para catalogo publico:
  - `get_public_store_by_slug`.
  - `get_public_products_page`.
  - `search_public_products`.
  - `create_public_order`.
- La creacion de pedido debe ser una transaccion en Postgres:
  - Validar tienda activa.
  - Validar productos activos.
  - Validar stock.
  - Descontar stock.
  - Crear cliente/upsert.
  - Crear pedido e items.
- Usar RLS con politicas publicas controladas por RPC, no acceso abierto irrestricto a tablas.

## 4.9 Pedidos

Ruta: `/admin/orders`

Funcionalidades:

- Lista pedidos de la tienda.
- Paginacion real de 10 en 10.
- Orden por fecha descendente.
- Filtro por estado:
  - Nuevo.
  - Confirmado.
  - En preparacion.
  - Entregado.
  - Cancelado.
- Actualiza estado del pedido.
- Elimina pedido.
- Abre detalle de pedido en modal.
- Muestra cliente, telefono, direccion, notas, campos personalizados.
- Muestra items, cantidades, precios, subtotal y total.
- Muestra metodo/costo de envio.
- Abre WhatsApp del cliente.
- Genera vista imprimible/PDF del pedido usando `window.print`.

Estados:

- `new`.
- `confirmed`.
- `preparing`.
- `delivered`.
- `cancelled`.

Recomendacion para Supabase:

- Tablas:
  - `orders`.
  - `order_items`.
  - `order_custom_fields`.
- Indices:
  - `(store_id, created_at desc)`.
  - `(store_id, status, created_at desc)`.
- Crear historial de cambios de estado: `order_status_history`.

## 4.10 Clientes

Ruta: `/admin/customers`

Funcionalidades:

- Lista clientes de la tienda por ultima compra.
- KPIs:
  - Total clientes.
  - Pedidos acumulados.
  - Total vendido a clientes.
- Busqueda local por nombre o telefono.
- Paginacion local de 20 en 20.
- Ver detalle/historial de cliente.
- Cargar pedidos del cliente:
  - Principalmente por `clientId`.
  - Fallback por `customer.phone`.
  - Fallback sin `orderBy` si falta indice.
- Copiar telefono.
- Abrir WhatsApp.
- Eliminar cliente sin eliminar pedidos.

Recomendacion para Supabase:

- Tabla `clients`.
- Relacion `orders.client_id`.
- Indice por `(store_id, last_order_at desc)`.
- Usar `ilike`/trigram para busqueda por nombre/telefono.
- No eliminar fisicamente clientes por defecto; preferir `deleted_at`.

## 4.11 Configuracion de tienda

Ruta: `/admin/settings`

Funcionalidades:

- Editar identidad de tienda:
  - Nombre.
  - Slug.
  - Descripcion.
  - Estado activo/inactivo.
  - Color de marca.
- Logo:
  - Subida a Firebase Storage.
  - Compresion antes de subir.
  - Borra logo anterior si existe.
- Banner:
  - Subida a Firebase Storage.
  - Compresion antes de subir.
  - Borra banner anterior si existe.
- Contacto/redes:
  - WhatsApp principal.
  - Instagram.
  - Facebook.
  - Email.
  - Telefono.
  - Ubicacion/direccion.
- Links de catalogo:
  - Publico.
  - Mayorista.
  - Compartir/copiar.
- Configuracion de envio:
  - Activar/desactivar envios.
  - Seleccionar metodos.
  - Costo contra entrega.
  - Costo transportadora.
  - Ocultar precios de envio.
  - Nota de envio.
- Formulario de compra:
  - Crear campos personalizados.
  - Reordenar campos.
  - Eliminar campos.
  - Tipos de campo.
  - Placeholder.
  - Opciones para select.
  - Obligatorio/opcional.
  - Visible/oculto.

Validaciones:

- Nombre de tienda obligatorio.
- Slug valido obligatorio.
- Campos personalizados deben tener nombre.
- Campos tipo lista deben tener al menos una opcion.

Recomendacion para Supabase:

- Tabla `stores`.
- Tabla opcional `checkout_fields` para no guardar JSON grande en store.
- Storage bucket `store-assets`.
- Politicas de Storage por `store_id`.
- Slug unico.

## 4.12 Suscripcion

Ruta: `/admin/subscription`

Funcionalidades:

- Carga informacion de tienda/suscripcion.
- Evalua prueba gratis activa o vencida.
- Si la prueba vencio, actualiza tienda a:
  - `hasActiveSubscription=false`.
  - `subscriptionStatus=trial_expired`.
  - `freeTrialStatus=expired`.
- Muestra estado:
  - Sin datos.
  - Prueba gratis.
  - Prueba por vencer.
  - Prueba vencida.
  - Inactiva.
  - Activa.
  - Por vencer.
  - Vencida.
- Calcula dias restantes.
- Muestra fecha de vencimiento.
- Muestra tienda y origen.
- Permite copiar correo registrado.
- Abre link externo de pago Wompi.

Backend relacionado:

- Firebase Function `activateSubscription`.
- Recibe email por POST.
- Busca usuario por email.
- Busca tienda por ownerUid.
- Calcula nueva fecha de fin:
  - Desde fin de suscripcion actual si sigue vigente.
  - Desde fin de prueba si paga durante prueba.
  - Desde hoy si no hay nada activo.
- Actualiza tienda como suscripcion activa.
- Crea registro en `subscriptionPayments`.

Recomendacion para Supabase:

- Integrar Wompi con webhook real.
- Tablas:
  - `subscriptions`.
  - `subscription_payments`.
  - `plans`.
- Edge Function `wompi_webhook`.
- No depender de activacion manual por email.
- La disponibilidad del catalogo debe depender de una vista/funcion `store_access_status`.

## 4.13 Superadmin

Ruta: `/system/stores`

Funcionalidades:

- Acceso restringido a superadmin.
- Lista tiendas registradas paginadas.
- Busca en la pagina actual por:
  - Nombre.
  - Slug.
  - Email propietario.
  - UID.
  - WhatsApp.
- Filtra por estado activo/inactivo.
- Muestra:
  - Tienda.
  - Link publico.
  - Propietario.
  - Contacto.
  - Estado.
  - Suscripcion.
  - Fecha de registro.
- Abre modal de auditoria.
- Copia email, UID y WhatsApp.
- Activa/desactiva tiendas.

Recomendacion para Supabase:

- Panel superadmin con rol real.
- Vista `admin_store_audit`.
- Acciones RPC:
  - `admin_toggle_store_status`.
  - `admin_extend_subscription`.
  - `admin_activate_subscription`.
  - `admin_impersonate_store` si se necesita soporte.

## 5. Modelo de datos actual inferido

### stores

Campos observados:

- `id`.
- `name`.
- `slug`.
- `description`.
- `businessType`.
- `city`.
- `whatsapp`.
- `address`.
- `ownerUid`.
- `ownerEmail`.
- `isActive`.
- `source`.
- `brandColor`.
- `logoUrl`.
- `logoPath`.
- `bannerUrl`.
- `bannerPath`.
- `instagram`.
- `facebook`.
- `email`.
- `phone`.
- `location`.
- `shippingEnabled`.
- `shippingMethods`.
- `shippingCostCOD`.
- `shippingCostCarrier`.
- `shippingNote`.
- `shippingHidePrices`.
- `checkoutFields`.
- `subscriptionType`.
- `subscriptionStatus`.
- `hasActiveSubscription`.
- `subscriptionStartAt`.
- `subscriptionEndAt`.
- `subscriptionLastPaymentAt`.
- `hasFreeTrial`.
- `freeTrialDays`.
- `freeTrialStatus`.
- `freeTrialSource`.
- `trialStartedAt`.
- `trialEndsAt`.
- `trialEndsAtMs`.
- `createdAt`.
- `updatedAt`.

Subcolecciones:

- `categories`.
- `products`.
- `orders`.
- `clients`.
- `subscriptionPayments`.

### categories

- `id`.
- `name`.
- `order`.
- `createdAt`.
- `updatedAt`.

### products

- `id`.
- `name`.
- `sku`.
- `description`.
- `price`.
- `wholesalePrice`.
- `categoryId`.
- `images`.
- `videos`.
- `options`.
- `variants`.
- `isActive`.
- `allowsCashOnDelivery`.
- `discount`.
- `order`.
- `createdAt`.
- `updatedAt`.

### orders

- `id`.
- `status`.
- `channel`.
- `clientId`.
- `customer`.
- `customFields`.
- `notes`.
- `items`.
- `subtotal`.
- `shippingMethod`.
- `shippingCost`.
- `total`.
- `createdAt`.
- `updatedAt`.

### clients

- `id` normalmente telefono.
- `name`.
- `phone`.
- `address`.
- `customFields`.
- `notes`.
- `totalOrders`.
- `totalSpent`.
- `lastOrderAt`.
- `createdAt`.
- `updatedAt`.

### subscriptionPayments

- `id`.
- `email`.
- `ownerUid`.
- `storeId`.
- `status`.
- `type`.
- `hadFreeTrial`.
- `previousFreeTrialStatus`.
- `previousTrialEndsAt`.
- `previousTrialEndsAtMs`.
- `createdAt`.
- `subscriptionStartAt`.
- `subscriptionBaseDate`.
- `subscriptionEndAt`.

## 6. Requerimientos funcionales

### Autenticacion y usuarios

- RF-001: El sistema debe permitir registro con email y password.
- RF-002: El sistema debe crear una tienda asociada al usuario registrado.
- RF-003: El sistema debe permitir inicio de sesion.
- RF-004: El sistema debe permitir recuperacion de password por correo.
- RF-005: El sistema debe proteger rutas administrativas.
- RF-006: El sistema debe diferenciar administradores de tienda y superadministradores.

### Tiendas

- RF-010: El administrador debe poder editar nombre, slug, descripcion y estado de la tienda.
- RF-011: El sistema debe exponer una URL publica por slug.
- RF-012: El sistema debe impedir acceso publico cuando la tienda este inactiva o sin suscripcion valida.
- RF-013: El administrador debe poder configurar logo, banner y color de marca.
- RF-014: El administrador debe poder configurar redes sociales y datos de contacto.
- RF-015: El administrador debe poder compartir link publico y link mayorista.

### Categorias

- RF-020: El administrador debe poder crear categorias.
- RF-021: El administrador debe poder editar categorias.
- RF-022: El administrador debe poder eliminar categorias.
- RF-023: El administrador debe poder ordenar categorias.
- RF-024: El sistema debe permitir compartir links directos a categorias.
- RF-025: El catalogo publico debe filtrar productos por categoria.

### Productos

- RF-030: El administrador debe poder crear productos.
- RF-031: El administrador debe poder editar productos.
- RF-032: El administrador debe poder eliminar productos.
- RF-033: El administrador debe poder activar/desactivar productos.
- RF-034: El administrador debe poder ordenar productos.
- RF-035: El producto debe soportar precio base.
- RF-036: El producto debe soportar precio mayorista.
- RF-037: El producto debe soportar descuento porcentual o valor fijo.
- RF-038: El producto debe soportar imagenes.
- RF-039: El producto debe soportar videos segun plan.
- RF-040: El producto debe soportar variantes con precio, stock y SKU.
- RF-041: El producto debe indicar si permite pago contra entrega.
- RF-042: El administrador debe poder buscar productos.
- RF-043: El administrador debe poder importar productos desde Excel.
- RF-044: El administrador debe poder exportar productos a Excel.
- RF-045: El administrador debe poder importar productos desde JSON.
- RF-046: El sistema debe aplicar limites por plan.

### Catalogo publico

- RF-050: El visitante debe poder abrir catalogo por slug.
- RF-051: El visitante debe poder navegar categorias.
- RF-052: El visitante debe poder buscar productos.
- RF-053: El visitante debe poder ver imagenes, videos y descripcion.
- RF-054: El visitante debe poder ver precios con descuento.
- RF-055: El visitante debe poder abrir catalogo mayorista.
- RF-056: El visitante debe poder agregar productos al carrito.
- RF-057: El visitante debe poder seleccionar variantes.
- RF-058: El visitante debe poder modificar cantidades.
- RF-059: El carrito debe persistir localmente por tienda y tipo de catalogo.

### Checkout y pedidos

- RF-060: El visitante debe diligenciar nombre, telefono y direccion.
- RF-061: El visitante debe diligenciar campos personalizados activos.
- RF-062: El visitante debe seleccionar metodo de envio si aplica.
- RF-063: El sistema debe validar productos que no permiten contra entrega.
- RF-064: El sistema debe crear pedido.
- RF-065: El sistema debe actualizar o crear cliente.
- RF-066: El sistema debe descontar stock.
- RF-067: El sistema debe abrir WhatsApp con mensaje del pedido.
- RF-068: El administrador debe ver pedidos.
- RF-069: El administrador debe cambiar estado de pedido.
- RF-070: El administrador debe eliminar pedidos.
- RF-071: El administrador debe imprimir/guardar PDF del pedido.

### Clientes

- RF-080: El sistema debe crear clientes automaticamente desde pedidos.
- RF-081: El administrador debe listar clientes.
- RF-082: El administrador debe buscar clientes.
- RF-083: El administrador debe ver historial de pedidos por cliente.
- RF-084: El administrador debe contactar cliente por WhatsApp.
- RF-085: El administrador debe eliminar cliente sin borrar pedidos.

### Suscripciones

- RF-090: El sistema debe manejar prueba gratis de 7 dias.
- RF-091: El sistema debe detectar prueba vencida.
- RF-092: El sistema debe mostrar estado de suscripcion.
- RF-093: El sistema debe permitir ir a pasarela de pago.
- RF-094: El sistema debe activar suscripcion posterior a pago.
- RF-095: El sistema debe bloquear catalogos sin acceso vigente.

### Superadmin

- RF-100: El superadmin debe listar tiendas.
- RF-101: El superadmin debe auditar datos de tienda.
- RF-102: El superadmin debe activar/desactivar tiendas.
- RF-103: El superadmin debe filtrar tiendas por estado.

## 7. Requerimientos no funcionales

### Rendimiento

- RNF-001: El catalogo publico debe cargar la primera pagina en menos de 2 segundos en conexiones moviles normales.
- RNF-002: Las listas deben usar paginacion real, no cargar todo en memoria.
- RNF-003: Las imagenes deben servirse optimizadas por tamano, formato y calidad.
- RNF-004: Las busquedas en catalogos grandes deben usar indices, no escaneo completo.
- RNF-005: El dashboard debe consultar metricas agregadas, no calcular todo en frontend.

### Escalabilidad

- RNF-010: El sistema debe soportar tiendas con 10.000+ productos.
- RNF-011: El sistema debe soportar multiples tiendas con aislamiento de datos.
- RNF-012: Importaciones grandes deben ejecutarse por lotes o backend.
- RNF-013: Exportaciones grandes deben usar procesos controlados para no bloquear UI.

### Seguridad

- RNF-020: Cada administrador solo debe acceder a su tienda.
- RNF-021: El superadmin debe tener rol controlado en base de datos.
- RNF-022: Las operaciones publicas deben limitarse a tiendas activas y productos activos.
- RNF-023: La creacion de pedidos debe validar precios y stock en backend.
- RNF-024: No se debe confiar en totales enviados por el frontend.
- RNF-025: Storage debe restringirse por tienda/propietario.

### Disponibilidad y consistencia

- RNF-030: La creacion de pedidos y descuento de stock debe ser transaccional.
- RNF-031: Si falla WhatsApp, el pedido no debe duplicarse.
- RNF-032: El sistema debe manejar productos agotados.
- RNF-033: La suscripcion debe evaluarse de forma consistente en frontend y backend.

### Usabilidad

- RNF-040: La interfaz debe ser mobile-first.
- RNF-041: El checkout debe requerir pocos pasos.
- RNF-042: El panel admin debe ser claro para usuarios no tecnicos.
- RNF-043: Las acciones destructivas deben pedir confirmacion.
- RNF-044: Deben existir estados de carga, error y vacio en cada modulo.

### Mantenibilidad

- RNF-050: Separar componentes por dominio.
- RNF-051: Mover reglas de negocio a servicios/hooks.
- RNF-052: Usar tipos compartidos generados desde Supabase.
- RNF-053: Evitar componentes monoliticos.

## 8. Propuesta de arquitectura en Supabase

### Frontend

- React + Vite o Next.js.
- UI moderna con sistema de diseno consistente.
- Componentes reutilizables:
  - Tabla.
  - Drawer.
  - Modal.
  - Form fields.
  - Product card.
  - Checkout drawer.
  - Upload manager.

### Backend Supabase

- Supabase Auth.
- Postgres.
- Row Level Security.
- Supabase Storage o Cloudinary.
- Edge Functions para:
  - Webhook Wompi.
  - Crear pedido publico.
  - Importacion masiva.
  - Exportacion masiva.
  - Activacion/admin de suscripciones.

### Tablas sugeridas

- `profiles`.
- `stores`.
- `store_settings`.
- `categories`.
- `products`.
- `product_images`.
- `product_videos`.
- `product_options`.
- `product_variants`.
- `clients`.
- `orders`.
- `order_items`.
- `order_custom_fields`.
- `plans`.
- `subscriptions`.
- `subscription_payments`.
- `store_audit_logs`.

### Indices sugeridos

- `stores(slug)` unico.
- `stores(owner_id)`.
- `categories(store_id, sort_order)`.
- `products(store_id, sort_order)`.
- `products(store_id, category_id, sort_order)`.
- `products(store_id, is_active, sort_order)`.
- `orders(store_id, created_at desc)`.
- `orders(store_id, status, created_at desc)`.
- `clients(store_id, last_order_at desc)`.
- Indice full-text/trigram para productos:
  - Nombre.
  - SKU.
  - Descripcion.
  - Categoria.

## 9. Mejoras recomendadas para la nueva interfaz

### Catalogo publico

- Header mas elegante con logo, banner, categoria activa y boton carrito fijo.
- Busqueda sticky.
- Filtros por categoria, disponibilidad, precio y descuentos.
- Cards mas limpias con badges de descuento, agotado, mayorista.
- Modal de producto mas visual.
- Checkout en pasos:
  1. Carrito.
  2. Datos.
  3. Envio.
  4. Confirmar por WhatsApp.

### Admin

- Dashboard con graficas y rangos de fecha.
- Productos con tabla mas rapida, filtros y bulk actions.
- Editor de producto en drawer o pagina dedicada.
- Upload con progreso real y previsualizacion.
- Pedidos con kanban opcional por estado.
- Clientes tipo CRM basico.
- Ajustes agrupados por tabs:
  - General.
  - Branding.
  - Contacto.
  - Envios.
  - Checkout.
  - Suscripcion.

### Superadmin

- Busqueda global real.
- Filtros por plan, fuente, ciudad, estado.
- Acciones de soporte.
- Historial de cambios.

## 10. Riesgos actuales a corregir al migrar

- Busquedas y exportaciones que cargan demasiados datos.
- Reglas de negocio importantes en frontend.
- Falta de roles robustos.
- Suscripcion dependiente de activacion manual.
- Slug posiblemente no unico.
- Productos con arrays JSON grandes para variantes/imagenes.
- Dificultad para consultar reportes por estructura NoSQL.
- Componentes grandes con demasiadas responsabilidades.
- Codificacion de textos con caracteres mojibake en algunos archivos.

## 11. MVP recomendado para la nueva version

Primera fase:

- Auth Supabase.
- Tienda por usuario.
- Catalogo publico.
- Productos con categorias, imagenes, precio, descuento y stock simple.
- Carrito y pedidos por WhatsApp.
- Pedidos y clientes.
- Ajustes basicos de tienda.
- RLS y transaccion de pedido.

Segunda fase:

- Variantes completas.
- Importacion/exportacion Excel.
- Catalogo mayorista.
- Envios y campos personalizados.
- Suscripciones con Wompi webhook.

Tercera fase:

- Superadmin avanzado.
- Reportes.
- Busqueda full-text avanzada.
- Bulk actions.
- Mejoras CRM.
- Automatizaciones de WhatsApp.

## 12. Conclusion

El sistema actual ya cubre un flujo comercial completo: registro de tienda, administracion de catalogo, publicacion, carrito, pedido por WhatsApp, gestion de pedidos/clientes y control de suscripcion. La migracion a Supabase debe conservar esa logica de negocio, pero mover reglas criticas al backend, normalizar el modelo de datos, aplicar RLS y mejorar busqueda/paginacion para soportar catalogos grandes.

La nueva version deberia enfocarse en tres objetivos:

1. Menos costo y mas rendimiento con consultas paginadas, indices y funciones transaccionales.
2. Mayor seguridad con roles, RLS y validacion de pedidos en backend.
3. Mejor experiencia visual y operativa con una UI moderna, responsive y orientada a ventas.
