1. Tela Inicial (Pré-login / Registro)
1.1. Funcionalidades
Área para:
Login.
Registro de novo escritório contábil (cliente da plataforma).
Exibir informações gerais:
Quais modelos de notas o sistema busca.
Quais estados são atendidos.
Quais tipos de movimentos (entrada, saída, etc.).
Outras informações comerciais/técnicas (a definir).
1.2. Pagamento e Acesso Inicial
Ao registrar um novo escritório:
O escritório precisa realizar o pagamento para conseguir utilizar a plataforma.
Integração de pagamento:
Usar API do Mercado Pago.
Após o pagamento:
Gerar um ID único da compra.
Esse ID deve ser exibido depois na aba Configurações.
A chave de ativação/licença do escritório será liberada com base nesse pagamento.
2. Dashboard (Módulo do Escritório)
2.1. Identificação do Escritório
Na parte superior central do Dashboard:
Exibir:
Número do escritório (ID).
Nome do escritório.
Regra do ID:
Cada escritório que se cadastrar gera um ID numérico único.
Numeração sequencial: 1, 2, 3, 4, …
2.2. Cabeçalho (Topo da Tela)
Canto direito superior:

Ícone de usuário para logout.
Ícone de sino para notificações.
Notificações:

Certificados vencidos.
Certificados prestes a vencer.
Dois filtros:
Um para vencidos.
Um para a vencer.
Regra:
Notificar 15 dias antes do vencimento do certificado.
Preferências:

Alternar tema claro/escuro.
Inserir logomarca do escritório.
2.3. Conteúdo do Dashboard
Menu lateral – DASHBOARD:
Exibir:
Gráfico de evolução de notas (com seleção de mês).
Lista/painel com as notas mais recentes que entraram no sistema.
2.4. Central de Ajuda
Menu Central de Ajuda:
Manuais do sistema.
FAQ contendo:
Explicação do que faz cada menu.
Modelos de notas atendidos.
Movimentos (entrada, saída, etc.).
3. Módulo de Solicitações & Kanban (Escritório ⇄ Administrador da Plataforma)
3.1. Tela de Solicitações (Escritório)
Menu Solicitações:
Campos para o escritório informar:
Nome do escritório.
CNPJ.
Descrição da solicitação (ajustes, melhorias, dúvidas).
Opção específica:
“Solicitar treinamento da plataforma”.
3.2. Notificações de Solicitações (Admin da Plataforma)
No painel do administrador (lado da plataforma):
As solicitações do escritório:
Devem ser listadas em uma central.
Podem gerar:
Notificação no sino.
(Opcional) Notificação via WhatsApp.
3.3. Kanban de Solicitações (Visão do Escritório)
No painel do escritório:

Exibir um Kanban (acima de Configurações) com andamento de suas solicitações.
Status:

Aguardando.
Em análise.
Aguardando aprovação do cliente (escritório).
Implementado.
Funcionalidades:

Escritório consegue acompanhar status.
Pode interagir (comentários simples).
Numeração:

Solicitações numeradas:
01, 02, 03, … conforme abertas.
4. Cadastro de Empresas (Clientes do Escritório), Contador e Escritório
4.1. Conceito
Escritório = cliente da plataforma.
Empresa = cliente do escritório (empresa atendida).
O sistema é usado pelo escritório para gerenciar notas das empresas dele.
4.2. Pontos de Regra a Definir
Onde e como o certificado vinculado à empresa será armazenado (padrões de segurança).
A empresa precisa ter inscrição estadual obrigatoriamente para usar a busca?
A empresa precisa, obrigatoriamente, estar vinculada a contador ou escritório para ser habilitada para busca?
4.3. Tela de Cadastro da Empresa
Campos:

Dados da empresa (cliente do escritório):

Nome.
CNPJ/CPF.
Inscrição Estadual (se houver).
Inscrição Municipal (se houver).
Certificado:

Campo para vincular certificado da empresa (se houver).
Opção de cadastrar todos os certificados relevantes:
Da empresa.
Do contador.
Do escritório.
Validação do CNPJ do certificado.
Data de referência:

Campo de data para definir a partir de quando buscar as notas.
Regras:
Se preenchida:
Buscar notas a partir dessa data.
Se vazia:
Buscar tudo que o portal liberar.
Essa data deve ser armazenada e usada em:
Buscas manuais.
Agendamentos.
4.4. Serviços da Empresa
Dentro do cadastro da empresa, menu SERVIÇOS:

Portal:
Login e senha usados pela empresa em ambiente nacional ou estadual.
Webservice:
Uso do certificado da empresa com acesso ao ambiente nacional.
4.5. Cadastro do Contador
Menu Contador (dados do profissional contábil usado nas operações):

Nome.
CPF.
Certificado.
Login e senha de portais específicos (ex.: estado do PR que usa login/senha em vez de certificado diretamente).
4.6. Cadastro do Escritório (Dados do Próprio Escritório)
Menu Escritório:
Nome.
CNPJ.
Certificado.
4.7. Fluxo de Cadastro (Front-end)
Ao cadastrar a primeira empresa:

Solicitar cadastro do contador (com opção de pular).
Depois solicitar cadastro do escritório (dados institucionais).
Ao cadastrar outras empresas:

Perguntar:
Deseja vincular a um contador já cadastrado ou cadastrar um novo? (com opção de pular).
Deseja vincular a um escritório (dados já existentes) ou pular.
4.8. Vinculação em Massa
Opção para vincular várias empresas de uma vez, seguindo o padrão:
Nome.
CNPJ/CPF.
I.E.
I.M.
Perguntar se deseja:
Vincular ao contador já cadastrado.
Vincular ao escritório já cadastrado.
Demais detalhes específicos devem ser preenchidos manualmente depois.
5. Notas Fiscais
5.1. Colunas na Tela de Notas
A tela de Notas Fiscais deve ter, pelo menos:

Indicação se o XML está disponível.
Status “Aguardando download do XML” (quando ainda não baixado).
Número do documento.
Data de inclusão da nota no sistema.
Informações de validade:
Regra: notas de todos os modelos serão excluídas após 180 dias.
Coluna mostrando quanto tempo falta para a exclusão (contagem regressiva baseada na data de inclusão/obtenção do XML).
5.2. Diferenciar Chave x XML
O sistema deve distinguir:
Somente chave de acesso cadastrada.
XML baixado e armazenado.
Ajustar status para:
Não deixar nota como “aguardando download” se o XML já estiver disponível.
Melhorar fluxo de status de download:
Ex.: “Somente chave”, “Download em andamento”, “XML disponível”, “Erro no download”.
5.3. Regras Específicas por Estado
Alguns estados permitem duas procurações:
Uma para o escritório.
Uma para o contador.
Regra:
Rodar duas buscas:
Usando certificado/procuração do escritório.
Usando certificado/procuração do contador.
Objetivo: identificar qual certificado tem permissão efetiva na SEFAZ.
5.4. Informações e Perguntas Abertas
Definir:

Quais modelos de notas já são suportados.
Quais estados a plataforma cobre.
Quais movimentos:
Entrada.
Saída.
Outros (se houver).
Se for só um tipo de movimento, documentar o motivo.
Funções extras:

Exibir quantidade total de notas (por período).
Reforçar que notas são excluídas automaticamente após 180 dias.
6. Agendamento
6.1. Configuração
Permitir agendar:
Execução para todas as empresas do escritório.
Por modelo de nota.
Por tipo de ação, conforme regra do estado:
Estado que libera XML:
Apenas opção de busca/consulta.
Estado que libera apenas chave:
Opção de download da chave/XML.
6.2. Uso de Certificado da Matriz nas Filiais
Cenário:

Certificado da matriz é utilizado pelas filiais.
Portal pode bloquear por excesso de requisição no mesmo certificado.
Regra:

Antes de buscar notas de uma filial:
Verificar se aquele certificado foi usado nos últimos 2 horas.
Se sim:
Marcar a busca dessa filial como “Aguardando”.
Aguardar completar 2 horas para tentar novamente.
Se houver várias filiais:
Repetir a mesma verificação para cada uma.
6.3. Pontos a Definir
Quanto tempo para trás as buscas devem considerar?
Ex.: últimos 30 dias, últimos 90 dias, ou a partir de uma data definida.
Devemos permitir criar agendamentos por grupo de empresas?
É necessário salvar uma data padrão de referência por empresa ou por agendamento?
6.4. Testes
Testar:
Cadastro de empresas.
Execução de agendamento.
Respeito às regras:
Data de referência.
Tipo de documento por estado.
Regras de certificados (matriz/filial).
7. Tela de Processo (Fila de Execução)
7.1. Objetivo
Mostrar o andamento das operações do escritório em:
Buscas de notas.
Downloads de notas.
Execuções manuais e automáticas (agendamentos).
7.2. Regras da Fila
Sempre que:

O escritório executa uma busca manual.
Um agendamento é executado.
A empresa entra em uma fila de processo.

Na tela de Processo exibir:

Nome da empresa.
Momento de inclusão na fila.
Status:
Em processamento (empresa atual).
Aguardando (demais).
Observações:
Se concluiu com sucesso.
Motivo de erro (certificado vencido, SEFAZ fora, permissão, etc.).
8. Chave Manual
(Back-end pronto, falta interface)

8.1. Objetivo
Permitir ao escritório lançar chaves de acesso manualmente para que o sistema realize o download automático do XML.
8.2. Validações
Antes de processar a chave:
Verificar se a empresa:
Possui certificado informado.
Regra de ambiente:
Ex.: empresa de SC:
Busca padrão pode ser na SEFAZ-SC.
Para download automático, o sistema deve, quando necessário, utilizar o ambiente nacional.
9. Configurações & Ativação da Plataforma
9.1. Informações na Tela de Configurações
Exibir:
Chave de ativação do escritório.
Plano contratado.
Valor do plano.
ID da compra (do Mercado Pago).
9.2. Regras da Chave
Validação baseada em pagamento:

Se o escritório não pagar após 3 dias do vencimento:
A chave é bloqueada.
Para liberar:
Efetuar o pagamento.
Fluxo:

Ao se registrar:
O escritório visualiza os planos e realiza a contratação.
Após o pagamento:
É enviada uma notificação contendo a chave.
O ID da compra fica disponível em Configurações.
10. Menu Usuários (Usuários do Cliente do Escritório)
10.1. Conceito
O escritório é o cliente da plataforma.
Ele atende várias empresas.
O menu Usuários serve para o escritório criar acessos para pessoas dessas empresas (clientes dele), com acesso restrito.
10.2. Local do Menu
Menu lateral do escritório:
Item: Usuários
10.3. Funções para o Escritório
Criar, editar e desativar usuários vinculados ao seu escritório, para uso por parte dos clientes (empresas atendidas).
Campos do usuário:
Nome.
E-mail (login).
Senha (ou envio de link para definição).
Situação: Ativo / Inativo.
Empresa(s) às quais esse usuário terá acesso (dentro da carteira do escritório).
10.4. Regras de Acesso do Usuário
Cada usuário:

Fica vinculado apenas ao escritório que o criou.
Tem acesso somente às empresas selecionadas daquele escritório.
Permissões:

Acesso apenas à tela de Notas Fiscais das empresas vinculadas.
Foco: envio de documentos.
Usuário NÃO pode:

Acessar Dashboard geral do escritório.
Acessar Cadastros (empresa, contador, escritório).
Acessar Agendamentos.
Ver Tela de Processo (Fila).
Ver ou abrir Solicitações.
Alterar Configurações, plano ou chave.
Acessar o menu Usuários.
10.5. Upload de XML e PDF
Na visão do usuário (cliente do escritório):

Na tela de Notas Fiscais:

Função para anexar:
XML.
PDF.
Modos de envio:
Individual (um arquivo por vez).
Em lote (vários arquivos).
O sistema deve:

Ler os arquivos e identificar:
CNPJ/CPF.
Chave de acesso.
Vincular esses arquivos à empresa correta do escritório.
Registrar:
Data e hora do upload.
Qual usuário fez o envio.
Validações:

Extensões permitidas:
.xml
.pdf
Tamanho máximo de arquivo e de lote.
Tratamento para duplicidade:
Se a mesma chave já existe, notificar e evitar duplicação.
11. API / Integrações
11.1. Objetivo
Permitir integração com sistemas de terceiros (ERP, sistemas internos do escritório ou do cliente), para:

Enviar XML e PDF.
Consultar notas e metadados.
11.2. Conceito
Disponibilizar endpoints para:
Envio de documentos.
Consulta de notas (por CNPJ, período, modelo, etc.).
Uso:
Automatizar o envio das notas para outro sistema de contabilidade, financeiro ou armazenamento.
12. FAQ & Central de Ajuda
12.1. FAQ
Deve explicar:
Função de cada menu:
Dashboard.
Cadastro de empresas.
Contador.
Escritório.
Notas fiscais.
Agendamento.
Processos.
Solicitações.
Usuários.
Configurações.
Modelos de notas que o sistema busca.
Movimentos:
Entrada.
Saída.
Outros suportados.
12.2. Central de Ajuda
Conteúdo:
Passo a passo de:
Cadastro de empresa (cliente do escritório).
Configuração de certificados.
Agendamentos.
Uso da tela de Processo.
Uso de Chave Manual.
Criação e gestão de Usuários (acesso do cliente).
Upload de XML/PDF.
Ativação de plano e chave do escritório.