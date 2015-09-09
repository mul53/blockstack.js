
from setuptools import setup, find_packages

setup(
    name='blockstore-client',
    version='0.0.3',
    url='https://github.com/blockstack/blockstore-client',
    license='GPLv3',
    author='Blockstack.org',
    author_email='support@blockstack.org',
    description='Python client library for Blockstore',
    keywords='blockchain bitcoin btc cryptocurrency name key value store data',
    packages=find_packages(),
    scripts=['bin/blockstore-cli'],
    download_url='https://github.com/blockstack/blockstore-client/archive/master.zip',
    zip_safe=False,
    include_package_data=True,
    install_requires=[
        'pybitcoin>=0.8.2',
        'kademlia>=0.5',
        'boto>=2.38.0'
    ],
    classifiers=[
        'Intended Audience :: Developers',
        'License :: GPLv3 License',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Topic :: Internet',
        'Topic :: Security :: Cryptography',
        'Topic :: Software Development :: Libraries :: Python Modules',
    ],
)