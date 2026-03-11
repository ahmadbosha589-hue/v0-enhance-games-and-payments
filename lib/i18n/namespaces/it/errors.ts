export default {
  general: {
    title: "Qualcosa è andato storto",
    description: "Si è verificato un errore imprevisto. Riprova più tardi.",
    retry: "Riprova",
    goHome: "Torna alla Home",
  },
  notFound: {
    title: "Pagina Non Trovata",
    description: "La pagina che stai cercando non esiste o è stata spostata.",
    goHome: "Torna alla Home",
    goBack: "Torna Indietro",
  },
  unauthorized: {
    title: "Accesso Negato",
    description: "Non hai i permessi per accedere a questa pagina.",
    login: "Accedi",
    goHome: "Torna alla Home",
  },
  forbidden: {
    title: "Accesso Vietato",
    description: "Non hai i permessi per visualizzare questa risorsa.",
    goHome: "Torna alla Home",
  },
  serverError: {
    title: "Errore del Server",
    description: "Si è verificato un errore interno. Stiamo lavorando per risolverlo.",
    retry: "Riprova",
  },
  maintenance: {
    title: "In Manutenzione",
    description: "Stiamo effettuando una manutenzione programmata. Torna presto!",
    estimatedTime: "Tempo stimato di completamento",
  },
  offline: {
    title: "Sei Offline",
    description: "Controlla la tua connessione internet e riprova.",
    retry: "Riprova",
  },
  rateLimit: {
    title: "Troppe Richieste",
    description: "Hai effettuato troppe richieste. Attendi prima di riprovare.",
    retryIn: "Riprova tra {{seconds}} secondi",
  },
  validation: {
    required: "Questo campo è obbligatorio",
    email: "Inserisci un indirizzo email valido",
    minLength: "Deve contenere almeno {{min}} caratteri",
    maxLength: "Non può superare {{max}} caratteri",
    passwordMatch: "Le password non coincidono",
    invalidFormat: "Formato non valido",
    invalidAddress: "Indirizzo portafoglio non valido",
    insufficientBalance: "Saldo insufficiente",
    minimumAmount: "L'importo minimo è {{amount}}",
    maximumAmount: "L'importo massimo è {{amount}}",
  },
  network: {
    timeout: "La richiesta è scaduta. Riprova.",
    connectionFailed: "Connessione al server fallita.",
    noInternet: "Nessuna connessione internet.",
  },
}
