let firestorePromise = null;

export const obterAdminFirestore = () => {
  if (!firestorePromise) {
    firestorePromise = Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/firestore'),
    ]).then(([adminAppModule, firestoreModule]) => {
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
      if (!projectId) throw new Error('FISCAL_FIREBASE_PROJECT_AUSENTE');
      const adminApp = adminAppModule.getApps()[0]
        || adminAppModule.initializeApp({ projectId });
      return firestoreModule.getFirestore(adminApp);
    }).catch(error => {
      // Do not poison all subsequent calls after a transient initialization failure.
      firestorePromise = null;
      throw error;
    });
  }
  return firestorePromise;
};
