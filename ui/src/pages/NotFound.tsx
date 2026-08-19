import React from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';

const NotFound: React.FC = () => {
  return (
    <PageLayout>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          textAlign: 'center',
        }}
      >
        <article>
          <hgroup>
            <h1>404</h1>
            <h2>page not found</h2>
          </hgroup>
          <p>the page you're looking for doesn't exist.</p>
          <Link to="/home" role="button" className="contrast">
            go to home
          </Link>
        </article>
      </div>
    </PageLayout>
  );
};

export default NotFound;
