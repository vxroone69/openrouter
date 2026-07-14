import { treaty } from '@elysiajs/eden'
import type { App } from 'app'
import { createContext, useContext } from 'react';
import { primaryBackendUrl } from '../config/api';

const client = treaty<App>(primaryBackendUrl, {
    fetch: {
        credentials: 'include'
    }
}) ;

const ElysiaClientContext = createContext(client);

export const ElysiaClientContextProvider = ElysiaClientContext.Provider;
export const useElysiaClient = () => {
    const client = useContext(ElysiaClientContext);
    return client;
}
